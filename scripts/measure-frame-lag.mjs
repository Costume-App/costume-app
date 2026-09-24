// Measures how far each recorded frame trails its beat mark.
//
//   node scripts/measure-frame-lag.mjs --video _probe --section lag
//
// For every beat in the take's markers.json that carries a cursor `pos`,
// crops 16x16 px centred on that position out of the raw webm, reads the
// per-frame V (red-difference chroma) average, and reports when the amber
// cursor dot first appears there relative to the beat's `t`. A positive lag
// means the frame shows the event AFTER the mark (the mark is early).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { sectionClipPath } from "./lib/training.mjs";
import { parseSignalStats, arrivalTime, lagConstant } from "./lib/frame-lag.mjs";
import { ZOOM } from "./lib/zoom.mjs";

const args = process.argv.slice(2);
const arg = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const slug = arg("video");
const section = arg("section");
if (!slug || !section || !/^_?[a-z0-9-]+$/.test(slug) || !/^[a-z0-9-]+$/.test(section)) {
  console.error("Usage: node scripts/measure-frame-lag.mjs --video <slug> --section <id>");
  process.exit(1);
}

const clip = sectionClipPath(slug, section);
const { beats } = JSON.parse(readFileSync(`${dirname(clip)}/markers.json`, "utf8"));
const KEY = "lavfi.signalstats.VAVG";
const C = 16;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const lags = [];
for (const b of beats) {
  if (!b.pos) continue;
  const x = clamp(b.pos.x - C / 2, 0, ZOOM.VIEW_W - C);
  const y = clamp(b.pos.y - C / 2, 0, ZOOM.VIEW_H - C);
  const log = execFileSync("ffmpeg", [
    "-v", "error", "-i", clip,
    "-vf", `crop=${C}:${C}:${x}:${y},signalstats,metadata=print:key=${KEY}:file=-`,
    "-an", "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const at = arrivalTime(parseSignalStats(log, KEY), b.t);
  if (at === null) {
    console.log(`  beat ${String(b.beat).padStart(2)}  t=${b.t.toFixed(3)}  NO ARRIVAL FOUND at (${b.pos.x},${b.pos.y})`);
    continue;
  }
  const lag = +(at - b.t).toFixed(3);
  lags.push(lag);
  console.log(`  beat ${String(b.beat).padStart(2)}  t=${b.t.toFixed(3)}  arrival=${at.toFixed(3)}  lag=${lag.toFixed(3)}s`);
}
if (lags.length === 0) {
  console.error("no beats with a measurable arrival");
  process.exit(2);
}
console.log(`\n${lags.length} sample(s): min ${Math.min(...lags).toFixed(3)}s, max ${Math.max(...lags).toFixed(3)}s`);
console.log(`lagConstant (add to the CURRENT FRAME_LAG_S): ${lagConstant(lags)}s`);
