// Prints the flattened, section-wide sentence index for a video's narration,
// the `s:` values that h.point() calls in scripts/lib/walkthroughs/<slug>.mjs
// must carry.
//
//   node scripts/list-vo-sentences.mjs --video getting-started
//   node scripts/list-vo-sentences.mjs --video getting-started --section intro
//
// Why this exists: sentences.json stores sentences PER PARAGRAPH, with `i`
// restarting at 0 and times relative to that paragraph. But `s` is the index
// across the section's WHOLE narration, because that is what
// build-synced-video.mjs flattens the paragraphs into. Deriving one from the
// other by hand is exactly the arithmetic that goes wrong, and it goes wrong
// silently, because a bad `s` still builds, it just shows the wrong thing at
// the wrong time. Read the numbers off this instead of counting.
//
// ⛔ Re-run after ANY edit to docs/training-videos/scripts/<slug>.md: inserting
// one sentence renumbers every later `s:` in that section (plan.md N12).
import { readFileSync, readdirSync, existsSync } from "fs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const slug = arg("--video");
const only = arg("--section");
if (!slug) {
  console.error("Usage: node scripts/list-vo-sentences.mjs --video <slug> [--section <id>]");
  process.exit(1);
}

const voDir = `recordings/training/vo/${slug}`;
if (!existsSync(voDir)) {
  console.error(`No VO for "${slug}" at ${voDir}, run generate-training-vo.py first.`);
  process.exit(1);
}

// Section ORDER comes from the walkthrough module, not the filesystem:
// readdirSync is alphabetical, and the narration order is the recording order.
const walkthroughPath = `scripts/lib/walkthroughs/${slug}.mjs`;
let order = null;
if (existsSync(walkthroughPath)) {
  const src = readFileSync(walkthroughPath, "utf8");
  const ids = [...src.matchAll(/^\s{4,6}id:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
  if (ids.length) order = ids;
}
const dirs = readdirSync(voDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const sections = order ? order.filter((id) => dirs.includes(id)) : dirs.sort();
const orphans = dirs.filter((d) => !sections.includes(d));

let total = 0;
for (const section of sections) {
  if (only && section !== only) continue;
  const path = `${voDir}/${section}/sentences.json`;
  if (!existsSync(path)) {
    console.log(`\n=== ${slug} / ${section} ===\n  (no sentences.json, re-run the generator)`);
    continue;
  }
  const paras = JSON.parse(readFileSync(path, "utf8"));
  console.log(`\n=== ${slug} / ${section} ===`);
  let s = 0;
  for (const pKey of Object.keys(paras).sort()) {
    for (const sent of paras[pKey]) {
      const dur = (sent.end - sent.start).toFixed(1);
      console.log(`  s${String(s).padStart(2)}  [${pKey} i${sent.i}] ${dur}s  ${sent.text}`);
      s += 1;
    }
  }
  console.log(`  → ${s} sentence(s); valid s: values are 0..${s - 1}`);
  total += s;
}

if (!only) console.log(`\n${slug}: ${sections.length} section(s), ${total} sentence(s)`);
if (orphans.length) console.log(`NOTE stale VO dirs not in the walkthrough: ${orphans.join(", ")}`);
