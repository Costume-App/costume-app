// Builds a narrated training video from its raw section takes.
//
//   node scripts/build-training-video.mjs --video getting-started
//
// Per section: time-warp the raw take beat by beat onto Ava's narration
// (lib/sync-plan.mjs), overlay zoom clips rendered from 2x stills
// (lib/zoom.mjs), write a video-only section file. Then concat
// [title card][sections][title card], lay the paragraph wavs on the
// timeline, and write the WebVTT captions and a sync sidecar for QC.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { loadWalkthrough, sectionClipPath, voDir, workDir, outDir, mmss } from "./lib/training.mjs";
import {
  SYNC, narrationLayout, flattenSentences, prepareMarkers, planSegments, finalizeSection, rawToOut,
} from "./lib/sync-plan.mjs";
import { ZOOM, zoomRect, zoomWindow, zoompanFilter } from "./lib/zoom.mjs";
import { packCues, toWebVTT } from "./lib/captions.mjs";
import { renderTitleCard } from "./lib/title-card.mjs";
import { missedBeats } from "./lib/missed-beats.mjs";

const W = ZOOM.VIEW_W;
const H = ZOOM.VIEW_H;
const FPS = ZOOM.FPS;

const args = process.argv.slice(2);
const slug = args[args.indexOf("--video") + 1];
if (!args.includes("--video") || !slug) {
  console.error("Usage: node scripts/build-training-video.mjs --video <slug> [--allow-missed-beats]");
  process.exit(1);
}
const allowMissedBeats = args.includes("--allow-missed-beats");

const walkthrough = await loadWalkthrough(slug);
const vo = voDir(slug);
const manifest = JSON.parse(readFileSync(`${vo}/manifest.json`, "utf8"));
const work = workDir(slug);
mkdirSync(work, { recursive: true });
mkdirSync(outDir(), { recursive: true });

const duration = (path) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" }).trim());
const ffmpeg = (argv) => execFileSync("ffmpeg", ["-v", "error", "-y", ...argv], { stdio: ["ignore", "ignore", "inherit"] });

// Plan every section.
const rows = walkthrough.sections.map((s, i) => {
  const paragraphs = manifest[s.id];
  if (!Array.isArray(paragraphs)) throw new Error(`${slug}/${s.id}: no narration in ${vo}/manifest.json`);
  const clip = sectionClipPath(slug, s.id);
  const takeDir = dirname(clip);
  const room = duration(clip) - SYNC.HEAD_TRIM_S;
  const { paraAt, narrEnd, outDur } = narrationLayout(paragraphs, { first: i === 0 });
  const sentPath = `${vo}/${s.id}/sentences.json`;
  const hasSentences = existsSync(sentPath);
  if (!hasSentences) {
    console.warn(`  ${slug}/${s.id}: no sentences.json, captions for this section will be empty`);
  }
  const sentences = flattenSentences(paragraphs, paraAt, hasSentences ? JSON.parse(readFileSync(sentPath, "utf8")) : null);
  const markersPath = `${takeDir}/markers.json`;
  if (!existsSync(markersPath)) throw new Error(`${slug}/${s.id}: no markers.json, re-record the section`);
  const rawBeats = JSON.parse(readFileSync(markersPath, "utf8")).beats ?? [];
  const markers = prepareMarkers(rawBeats, room);
  // prepareMarkers (lib/sync-plan.mjs) drops any beat inside the head/tail
  // trim with no log of its own, staying pure. Reported here by comparing
  // beat numbers before/after, rather than changing sync-plan's return
  // shape or its existing tests.
  const keptBeats = new Set(markers.map((m) => m.beat));
  for (const b of rawBeats) {
    if (!keptBeats.has(b.beat)) {
      console.warn(`  ${slug}/${s.id}: beat ${b.beat} dropped by head/tail trim (t=${b.t})`);
    }
  }
  const { segs, actual, pause } = finalizeSection(planSegments({ markers, sentences, room, outDur }), narrEnd, outDur);
  return { id: s.id, clip, takeDir, paragraphs, paraAt, narrEnd, sentences, rawBeats, markers, segs, actual, pause };
});

// Refuse to ship a section that recorded a missed beat (record-core.mjs's
// point()/zoom() mark a selector miss as ok:false instead of aborting, so a
// wrong freeze-frame would otherwise build silently). --allow-missed-beats
// overrides for a deliberate partial build.
const missed = missedBeats(rows);
if (missed.length > 0) {
  const list = missed.map((m) => `${m.section} beat ${m.beat}`).join(", ");
  if (!allowMissedBeats) {
    throw new Error(
      `Refusing to build ${slug}: missed beat(s) (recorder recorded ok:false): ${list}. ` +
      `Re-record the affected section(s), or override with --allow-missed-beats.`
    );
  }
  console.warn(`  ${slug}: building with ${missed.length} missed beat(s) (--allow-missed-beats): ${list}`);
}

// Zoom clips, section-relative windows.
for (const r of rows) {
  r.zooms = [];
  r.rawBeats.forEach((b) => {
    if (!b.zoom) return;
    const o0 = rawToOut(r.segs, b.t + 0.15);
    const o1 = rawToOut(r.segs, b.t + b.zoom.holdS - 0.1);
    const win = zoomWindow(o0, o1);
    if (!win) {
      console.warn(`  ${r.id}: zoom at beat ${b.beat} skipped (window ${o0} to ${o1} too short or trimmed)`);
      return;
    }
    const rect = zoomRect(b.zoom.box, b.zoom.scale, W, H);
    const out = `${work}/${r.id}-zoom${String(b.beat).padStart(2, "0")}.mp4`;
    const filter = zoompanFilter({ rect, scale: b.zoom.scale, frames: win.frames, easeFrames: win.easeFrames, vw: W, vh: H, outW: W, outH: H, fps: FPS });
    ffmpeg(["-i", `${r.takeDir}/${b.zoom.still}`, "-vf", `${filter},format=yuv420p`, "-frames:v", String(win.frames), "-c:v", "libx264", "-crf", "16", out]);
    r.zooms.push({ file: out, start: win.start, end: win.start + win.frames / FPS, beat: b.beat });
  });
}

// Section files: warp segments, then zoom overlays.
for (const r of rows) {
  const inputs = ["-i", r.clip, ...r.zooms.flatMap((z) => ["-i", z.file])];
  const parts = [`[0:v]split=${r.segs.length}${r.segs.map((_, j) => `[i${j}]`).join("")}`];
  r.segs.forEach((s, j) => {
    const pad = s.freeze > 0.02 ? `,tpad=stop_mode=clone:stop_duration=${s.freeze.toFixed(3)}` : "";
    parts.push(`[i${j}]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=(PTS-STARTPTS)*${s.factor.toFixed(4)},scale=${W}:${H},setsar=1,fps=${FPS},settb=AVTB${pad}[g${j}]`);
  });
  parts.push(`${r.segs.map((_, j) => `[g${j}]`).join("")}concat=n=${r.segs.length}:v=1:a=0[b0]`);
  r.zooms.forEach((z, k) => {
    parts.push(`[${k + 1}:v]setpts=PTS-STARTPTS+${z.start.toFixed(3)}/TB[z${k}]`);
    parts.push(`[b${k}][z${k}]overlay=eof_action=pass:enable='between(t,${z.start.toFixed(3)},${z.end.toFixed(3)})'[b${k + 1}]`);
  });
  r.file = `${work}/${r.id}.mp4`;
  ffmpeg([...inputs, "-filter_complex", parts.join(";"), "-map", `[b${r.zooms.length}]`, "-t", r.actual.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", r.file]);
}

// Title card.
const cardPng = `${work}/title-card.png`;
const browser = await chromium.launch();
try {
  await renderTitleCard(browser, { title: walkthrough.title, subtitle: "Measure My Costume training" }, cardPng);
} finally {
  await browser.close();
}

// Final timeline.
let cursor = SYNC.CARD_S;
const placements = [];
const absSentences = [];
const sidecar = { sections: [], beats: [], zooms: [] };
for (const r of rows) {
  r.paragraphs.forEach((_, k) => placements.push({ file: `${vo}/${r.id}/p${String(k).padStart(2, "0")}.wav`, at: cursor + r.paraAt[k] }));
  for (const s of r.sentences) {
    absSentences.push({ ...s, words: s.words.map((w) => ({ ...w, start: w.start + cursor, end: w.end + cursor })) });
  }
  r.markers.forEach((m, k) => {
    const at = rawToOut(r.segs, m.t + SYNC.HEAD_TRIM_S);
    const idx = Number.isInteger(m.s) ? m.s : null;
    sidecar.beats.push({ section: r.id, beat: k, at: at === null ? null : +(cursor + at).toFixed(2), sentence: idx, text: idx !== null ? r.sentences[idx]?.text ?? null : null });
  });
  r.zooms.forEach((z) => sidecar.zooms.push({ section: r.id, start: +(cursor + z.start).toFixed(2), end: +(cursor + z.end).toFixed(2) }));
  sidecar.sections.push({ id: r.id, start: +cursor.toFixed(2), end: +(cursor + r.actual).toFixed(2) });
  cursor += r.actual;
}
const total = cursor + SYNC.CARD_S;

const outMp4 = `${outDir()}/${slug}.mp4`;
const sectionInputs = rows.flatMap((r) => ["-i", r.file]);
const audioInputs = placements.flatMap((p) => ["-i", p.file]);
const audioBase = rows.length + 1;
const filter = [
  `[0:v]scale=${W}:${H},setsar=1,fps=${FPS},format=yuv420p,split[cin][cout]`,
  ...rows.map((_, i) => `[${i + 1}:v]setsar=1,fps=${FPS},format=yuv420p[s${i}]`),
  `[cin]${rows.map((_, i) => `[s${i}]`).join("")}[cout]concat=n=${rows.length + 2}:v=1:a=0[v]`,
  placements.map((p, i) => `[${audioBase + i}:a]adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`).join(";"),
  `${placements.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placements.length}:duration=longest:normalize=0,apad,atrim=duration=${total.toFixed(3)}[a]`,
].join(";");
ffmpeg([
  "-loop", "1", "-t", String(SYNC.CARD_S), "-i", cardPng,
  ...sectionInputs, ...audioInputs,
  "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outMp4,
]);

writeFileSync(`${outDir()}/${slug}.vtt`, toWebVTT(packCues(absSentences)));
writeFileSync(`${outDir()}/${slug}.sync.json`, JSON.stringify(sidecar, null, 2) + "\n");

console.log(`\n${slug}: per-section fit`);
for (const r of rows) {
  const declared = r.markers.filter((m) => Number.isInteger(m.s)).length;
  console.log(`  ${r.id.padEnd(22)} beats ${String(r.markers.length).padStart(2)} (s: ${declared})  zooms ${r.zooms.length}  pause ${r.pause}s` +
    (declared < r.markers.length ? "  <- annotate s: on every beat" : ""));
}
console.log(`\nBuilt ${outMp4} (${mmss(total)}), captions and sync sidecar beside it.`);
