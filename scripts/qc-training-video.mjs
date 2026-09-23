// Writes the images a human must look at before a training video is shown
// to Chris, and flags unexplained frozen footage.
//
//   node scripts/qc-training-video.mjs --video getting-started
//
// Output in recordings/training/qc/<slug>/:
//   <section>-sheet-NN.png  every 2 s of the section, 4x4 tiles (sampled
//                           across the WHOLE section, not just its start)
//   beat-<section>-NN.jpg   0.3 s after each beat lands (does the screen show
//                           what the sentence names?)
//   zoom-<section>-NN.jpg   mid-hold of each zoom (sharp? on target?)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { outDir, qcDir } from "./lib/training.mjs";
import { SYNC } from "./lib/sync-plan.mjs";
import { parseFreezes, unexplainedFreezes } from "./lib/qc.mjs";

const args = process.argv.slice(2);
const slug = args[args.indexOf("--video") + 1];
if (!args.includes("--video") || !slug) {
  console.error("Usage: node scripts/qc-training-video.mjs --video <slug>");
  process.exit(1);
}
const mp4 = `${outDir()}/${slug}.mp4`;
const sidecar = JSON.parse(readFileSync(`${outDir()}/${slug}.sync.json`, "utf8"));
const dir = qcDir(slug);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const ff = (argv) => execFileSync("ffmpeg", ["-v", "error", "-y", ...argv], { stdio: ["ignore", "ignore", "inherit"] });
const frameAt = (t, path) => ff(["-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", path]);

for (const s of sidecar.sections) {
  ff(["-ss", s.start.toFixed(2), "-t", (s.end - s.start).toFixed(2), "-i", mp4,
    "-vf", "fps=1/2,scale=480:-1,tile=4x4", "-vsync", "vfr", `${dir}/${s.id}-sheet-%02d.png`]);
}
const count = new Map();
for (const b of sidecar.beats) {
  if (b.at === null) continue;
  const n = count.get(b.section) ?? 0;
  count.set(b.section, n + 1);
  frameAt(b.at + 0.3, `${dir}/beat-${b.section}-${String(n).padStart(2, "0")}.jpg`);
}
sidecar.zooms.forEach((z, k) => frameAt((z.start + z.end) / 2, `${dir}/zoom-${z.section}-${String(k).padStart(2, "0")}.jpg`));

const totalS = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim());
// metadata=print logs at info level; :file=- sends it to stdout instead.
const log = execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-vf", "freezedetect=n=0.003:d=6,metadata=print:file=-", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const bad = unexplainedFreezes(parseFreezes(log), sidecar, { cardS: SYNC.CARD_S, totalS });

console.log(`QC images in ${dir}`);
console.log(`beats with no landing time: ${sidecar.beats.filter((b) => b.at === null).length}`);
if (bad.length) {
  console.log(`UNEXPLAINED FREEZES (footage static 6 s or more outside zooms and cards):`);
  for (const f of bad) console.log(`  at ${f.start.toFixed(1)}s for ${f.duration === null ? "?" : f.duration.toFixed(1)}s`);
  process.exitCode = 2;
} else {
  console.log("no unexplained freezes");
}
