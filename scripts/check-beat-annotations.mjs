// Static gate for the `s:` sentence annotations on beat-emitting calls in
// scripts/lib/walkthroughs/<slug>.mjs.
//
//   node scripts/check-beat-annotations.mjs            # every video
//   node scripts/check-beat-annotations.mjs --video sales
//
// A wrong `s:` does not crash anything, it builds a video that shows the
// wrong thing at the wrong moment, which only a human watching catches. This
// checks the two properties that are mechanically knowable:
//
//   1. IN RANGE, s < the section's sentence count (build-synced-video clamps
//      an over-range s to the last sentence, so the beat silently lands at the
//      end instead of erroring).
//   2. NON-DECREASING, beats are filmed in order and retiming can stretch a
//      beat but never reorder it (plan.md N4), so `s` must never go backwards
//      down a section.
//
// It CANNOT tell you an `s` points at the right sentence, only that it is
// structurally possible. Read scripts/list-vo-sentences.mjs for that.
//
// Calls inside module-level helpers (gotoContactCard, openPicker, …) are not
// attributable to one section by static reading; they are counted and reported
// separately rather than silently ignored.
import { readFileSync, readdirSync, existsSync } from "fs";

const args = process.argv.slice(2);
const only = args.indexOf("--video") === -1 ? null : args[args.indexOf("--video") + 1];

const BEAT_CALL = /h\.(point|zoom|navigateSlowly|openRecord)\s*\(/g;
const S_OPT = /\bs:\s*(\d+)/;
const MARK_FALSE = /\bmark:\s*false/;

function sentenceCount(slug, section) {
  const path = `recordings/training/vo/${slug}/${section}/sentences.json`;
  if (!existsSync(path)) return null;
  const paras = JSON.parse(readFileSync(path, "utf8"));
  return Object.values(paras).reduce((n, list) => n + list.length, 0);
}

/** The source slice belonging to each `id: "..."` section, in file order. */
function sliceSections(src) {
  const marks = [...src.matchAll(/^\s{4,6}id:\s*"([a-z0-9-]+)"/gm)];
  return marks.map((m, k) => ({
    id: m[1],
    // `start` is the slice's offset in src. It matters: match indices inside
    // `body` are body-relative, and the helper-detection below compares against
    // src-relative matches, mixing the two silently collapses two sections'
    // beats into one Set entry whenever they sit at the same offset within
    // their own slice, inventing phantom "helper" calls.
    start: m.index,
    body: src.slice(m.index, k + 1 < marks.length ? marks[k + 1].index : src.length),
  }));
}

/** Balanced-paren extent of one call's argument list, so a nested call or a
 * regex containing ")" cannot truncate it. */
function callArgs(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return src.slice(openIdx + 1);
}

let problems = 0;
let annotated = 0;
let unannotated = 0;
const files = existsSync("scripts/lib/walkthroughs")
  ? readdirSync("scripts/lib/walkthroughs").filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
  : [];

for (const file of files) {
  const slug = file.replace(/\.mjs$/, "");
  if (only && slug !== only) continue;
  const src = readFileSync(`scripts/lib/walkthroughs/${file}`, "utf8");
  const sections = sliceSections(src);
  const covered = new Set();
  const lines = [];

  for (const { id, body, start } of sections) {
    const n = sentenceCount(slug, id);
    let prev = -1;
    const beats = [];
    for (const m of [...body.matchAll(BEAT_CALL)]) {
      const argSrc = callArgs(body, m.index + m[0].length - 1);
      if (MARK_FALSE.test(argSrc)) continue; // parks without claiming a beat
      const sm = argSrc.match(S_OPT);
      beats.push({ s: sm ? Number(sm[1]) : null });
      covered.add(start + m.index);
    }
    if (!beats.length) continue;
    const missing = beats.filter((b) => b.s === null).length;
    annotated += beats.length - missing;
    unannotated += missing;
    const issues = [];
    if (n === null) issues.push("no sentences.json");
    for (const b of beats) {
      if (b.s === null) continue;
      if (n !== null && b.s >= n) issues.push(`s:${b.s} out of range (0..${n - 1})`);
      if (b.s < prev) issues.push(`s:${b.s} goes backwards after s:${prev}`);
      prev = Math.max(prev, b.s);
    }
    if (issues.length) problems += issues.length;
    if (issues.length || missing) {
      lines.push(
        `  ${id.padEnd(22)} ${String(beats.length).padStart(3)} beat(s)` +
          (missing ? `, ${missing} unannotated` : "") +
          (issues.length ? `  ⚠ ${[...new Set(issues)].join("; ")}` : ""),
      );
    }
  }

  const allCalls = [...src.matchAll(BEAT_CALL)].filter(
    (m) => !MARK_FALSE.test(callArgs(src, m.index + m[0].length - 1)),
  );
  const outside = allCalls.length - covered.size;
  if (lines.length || outside) {
    console.log(`\n${slug}`);
    lines.forEach((l) => console.log(l));
    if (outside > 0) console.log(`  (${outside} beat call(s) in module-level helpers, annotate at the helper or its call site)`);
  }
}

console.log(`\n${annotated} annotated, ${unannotated} unannotated, ${problems} structural problem(s)`);
process.exit(problems ? 1 : 0);
