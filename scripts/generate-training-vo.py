# Renders training-video narration with Microsoft Ava (edge-tts) from
# docs/training-videos/scripts/<slug>.md, one wav per paragraph, plus word
# and sentence timings taken straight from edge-tts WordBoundary events.
#
#   ~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video getting-started
#   ~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --all
#   ~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --selftest
#
# Cache: a paragraph re-renders only when its normalized TEXT changes. A
# change to VOICE, RATE or PITCH prints a notice and keeps the approved audio;
# pass --force (or delete the section dir) to re-render under new params.
# edge-tts calls a Microsoft endpoint, so renders retry with backoff.
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import edge_tts

VOICE = "en-US-AvaMultilingualNeural"
RATE = "+0%"
PITCH = "+0Hz"
SCRIPTS = Path("docs/training-videos/scripts")
VO_ROOT = Path("recordings/training/vo")
SECTION_RE = re.compile(r"^## .+ \(`([a-z0-9-]+)`\)\s*$")
TICKS = 10_000_000  # WordBoundary offsets are 100 ns ticks
MIN_WPS, MAX_WPS = 1.6, 4.2  # plausible words per second for a read


def normalize_for_tts(text: str) -> str:
    t = re.sub(r"\s*[\u2014\u2013]\s*", ", ", text)
    t = re.sub(r"…|\.\.\.", ".", t)
    t = re.sub(r"[\"“”]", "", t)
    t = re.sub(r"\s*,\s*,", ",", t)
    t = re.sub(r"\s*,\s*\.", ".", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def parse_script(path: Path):
    """[(section_id, [paragraph, ...])] in file order."""
    sections, cur_id, cur_lines = [], None, []

    def flush():
        if cur_id is None:
            return
        body = "\n".join(l for l in cur_lines if not l.lstrip().startswith(">"))
        paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", body) if p.strip()]
        if not paras:
            raise SystemExit(f"{path.name}: section {cur_id} has no narration")
        sections.append((cur_id, paras))

    for line in path.read_text().splitlines():
        m = SECTION_RE.match(line)
        if m:
            flush()
            cur_id, cur_lines = m.group(1), []
        elif cur_id is not None:
            cur_lines.append(line)
    flush()
    if not sections:
        raise SystemExit(f"{path.name}: no sections parsed (header format is ## Heading (`id`))")
    return sections


def split_sentences(text: str) -> list:
    parts = [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]
    return parts or [text]


def assign_words(clean_text: str, boundaries: list) -> list:
    """Sentences with per-word timing. Display text comes from the script
    tokens (punctuation kept); timing from boundaries, matched in order. On a
    token/boundary count mismatch, timing is spread by character share."""
    sentences = split_sentences(clean_text)
    tokens = [tok for s in sentences for tok in s.split()]
    if boundaries and len(tokens) == len(boundaries):
        timed = [{"text": tok, "start": b["start"], "end": b["end"]} for tok, b in zip(tokens, boundaries)]
    else:
        print(f"  WARNING: {len(tokens)} script tokens vs {len(boundaries)} boundaries; spreading by characters", flush=True)
        t0 = boundaries[0]["start"] if boundaries else 0.0
        t1 = boundaries[-1]["end"] if boundaries else 0.0
        total = sum(len(t) for t in tokens) or 1
        timed, acc = [], 0
        for tok in tokens:
            s = t0 + (t1 - t0) * acc / total
            acc += len(tok)
            timed.append({"text": tok, "start": round(s, 3), "end": round(t0 + (t1 - t0) * acc / total, 3)})
    out, k = [], 0
    for i, s in enumerate(sentences):
        n = len(s.split())
        chunk = timed[k:k + n]
        k += n
        out.append({
            "i": i,
            "start": round(chunk[0]["start"], 3),
            "end": round(chunk[-1]["end"], 3),
            "text": s,
            "words": [{"text": w["text"], "start": round(w["start"], 3), "end": round(w["end"], 3)} for w in chunk],
        })
    return out


async def _synth(text: str):
    com = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for ch in com.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"text": ch["text"], "start": ch["offset"] / TICKS, "end": (ch["offset"] + ch["duration"]) / TICKS})
    return bytes(audio), words


def synth(text: str):
    err = "unknown"
    for attempt in range(3):
        try:
            audio, words = asyncio.run(_synth(text))
            if audio and words:
                return audio, words
            err = "empty audio or no word boundaries"
        except Exception as e:  # network or service error; retry
            err = repr(e)
        time.sleep(2 * (2 ** attempt))
    raise SystemExit(f"edge-tts failed 3 times ({err}) on: {text[:80]}")


def to_wav(mp3: Path, wav: Path) -> None:
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(mp3),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(wav),
    ], check=True)


def wav_seconds(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def render_section(slug: str, section_id: str, paragraphs: list, force: bool) -> list:
    sec_dir = VO_ROOT / slug / section_id
    sec_dir.mkdir(parents=True, exist_ok=True)
    cache_path = sec_dir / "cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    sent_path = sec_dir / "sentences.json"
    sentences = json.loads(sent_path.read_text()) if sent_path.exists() else {}
    durations = []
    for i, raw in enumerate(paragraphs):
        key = f"p{i:02d}"
        clean = normalize_for_tts(raw)
        wav = sec_dir / f"{key}.wav"
        entry = cache.get(key)
        fresh = entry is not None and entry["text_sha"] == sha(clean) and wav.exists() and key in sentences
        if fresh and not force:
            if (entry["voice"], entry["rate"], entry["pitch"]) != (VOICE, RATE, PITCH):
                print(f"  NOTICE {section_id}/{key}: rendered with {entry['voice']} {entry['rate']} {entry['pitch']}; kept (use --force to re-render)", flush=True)
            durations.append(wav_seconds(wav))
            continue
        print(f"  render {section_id}/{key} ({len(clean.split())} words)", flush=True)
        audio, boundaries = synth(clean)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio)
        to_wav(Path(tmp.name), wav)
        Path(tmp.name).unlink()
        secs = wav_seconds(wav)
        wps = len(clean.split()) / secs
        if not (MIN_WPS <= wps <= MAX_WPS):
            raise SystemExit(f"{section_id}/{key}: {wps:.2f} words/s is implausible; listen to {wav}")
        sentences[key] = assign_words(clean, boundaries)
        cache[key] = {"text_sha": sha(clean), "voice": VOICE, "rate": RATE, "pitch": PITCH}
        durations.append(secs)
    # Drop paragraphs the script no longer has.
    for stale in sorted(sec_dir.glob("p*.wav")):
        if int(stale.stem[1:]) >= len(paragraphs):
            stale.unlink()
            cache.pop(stale.stem, None)
            sentences.pop(stale.stem, None)
    cache_path.write_text(json.dumps(cache, indent=2) + "\n")
    sent_path.write_text(json.dumps(sentences, indent=2, sort_keys=True) + "\n")
    return durations


def render_video(slug: str, force: bool) -> None:
    script = SCRIPTS / f"{slug}.md"
    if not script.exists():
        raise SystemExit(f"No script at {script}")
    manifest = {}
    for section_id, paragraphs in parse_script(script):
        manifest[section_id] = render_section(slug, section_id, paragraphs, force)
    out = VO_ROOT / slug / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(sum(v) for v in manifest.values())
    print(f"[{slug}] {len(manifest)} sections, {total:.1f}s of narration -> {out}", flush=True)


def selftest() -> None:
    assert normalize_for_tts("One \u2014 two...  three") == "One, two. three"
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "x.md"
        p.write_text("# Title\npreamble\n\n## Welcome (`welcome`)\n\nHello there.\n> note, not spoken\n\nSecond para.\n")
        assert parse_script(p) == [("welcome", ["Hello there.", "Second para."])]
    b = [{"text": w, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, w in enumerate(["Hi", "there", "Go", "now"])]
    s = assign_words("Hi there. Go now.", b)
    assert [x["text"] for x in s] == ["Hi there.", "Go now."]
    assert s[1]["words"][0] == {"text": "Go", "start": 1.0, "end": 1.4}
    s2 = assign_words("Hi there. Go now.", b[:3])
    assert len(s2) == 2 and s2[1]["end"] > s2[0]["start"]
    print("selftest OK")


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--video")
    g.add_argument("--all", action="store_true")
    g.add_argument("--selftest", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    slugs = [a.video] if a.video else sorted(p.stem for p in SCRIPTS.glob("*.md"))
    for slug in slugs:
        render_video(slug, a.force)


if __name__ == "__main__":
    sys.exit(main())
