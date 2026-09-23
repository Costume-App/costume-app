// WebVTT captions from Ava's word timings. Cues never span a sentence
// boundary, hold at most two lines, and linger briefly after the last word
// without overlapping the next cue. Word text comes from the script (with
// punctuation); only the timing comes from the TTS engine.
export const CAPTION = Object.freeze({ LINE_CHARS: 42, MAX_LINES: 2, MIN_CUE_S: 1.0, LINGER_S: 0.3 });

export function packCues(sentences) {
  const fits = (text) => wrapLines(text).length <= CAPTION.MAX_LINES;
  const cues = [];
  for (const s of sentences) {
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") });
      cur = [];
    };
    for (const w of s.words ?? []) {
      const next = [...cur, w].map((x) => x.text).join(" ");
      if (cur.length && !fits(next)) flush();
      cur.push(w);
    }
    flush();
  }
  for (let i = 0; i < cues.length; i++) {
    const nextStart = i + 1 < cues.length ? cues[i + 1].start : Infinity;
    const want = Math.max(cues[i].end + CAPTION.LINGER_S, cues[i].start + CAPTION.MIN_CUE_S);
    cues[i].end = Math.min(nextStart, want);
  }
  return cues;
}

export function wrapLines(text, width = CAPTION.LINE_CHARS) {
  if (text.length <= width) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") continue;
    const a = text.slice(0, i);
    const b = text.slice(i + 1);
    if (a.length <= width && b.length <= width && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best !== -1) return [text.slice(0, best), text.slice(best + 1)];
  // No balanced split fits: greedy fill. A single word longer than width stays unsplit on its own line.
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function vttTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(r, 3)}`;
}

export function toWebVTT(cues) {
  const body = cues
    .map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${wrapLines(c.text).join("\n")}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
