# Training Videos Pipeline + Video 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeatable pipeline that records, narrates (Microsoft Ava), zooms, captions, and QCs Measure My Costume training videos, proven end to end on video 1, "Getting Started".

**Architecture:** Port the ListingStack training harness (`~/projects/listing-stack-headshot/scripts/`) into `scripts/`, desktop only. Narration comes from edge-tts (Ava) with word timings. Each section's raw take is time-warped beat by beat onto the narration (pure `sync-plan.mjs`). Zoom-ins are rendered from 2x stills captured on camera, captions from Ava's word timings, and a title card from an HTML template. The demo org is seeded through the app's own API routes. Hosting and the `/guide` embed are a separate follow-up plan, written after Chris approves video 1.

**Tech Stack:** Node ESM scripts (`.mjs`), Playwright (already in `node_modules`), ffmpeg/ffprobe (Homebrew build, no `drawtext`), Python 3 in `~/.venvs/edge-tts` (edge-tts 7.2.8), Vitest for `scripts/**/*.test.mjs` (already in `vitest.config.ts`), Clerk Backend API (dev instance), Supabase service role.

**Spec:** `docs/superpowers/specs/2026-09-22-training-videos-design.md` (read it first, including the two "Correction found while planning" findings).

## Global Constraints

- Voice: `en-US-AvaMultilingualNeural`, rate `+0%`, pitch `+0Hz`.
- Output: 1920x1080, 30 fps, H.264 + AAC MP4, plus a WebVTT file beside it.
- Record only against a local production build: `npm run build && npm start` (port 6100). Never `next dev`, never a non-localhost base URL.
- Record only as the demo user in the demo org (`scripts/lib/demo-org.json`). Every script that mutates data asserts this first.
- Dev and prod share ONE Supabase database. Nothing touches any org except the demo org.
- Clerk secret key must start with `sk_test_` (dev instance).
- `recordings/` is gitignored. Every input a script reads has its producer committed in the repo.
- Blocking rules for every implementer: **no `any`** (lint errors on it), **NO EM-DASHES anywhere** (code, comments, docs, scripts, commit messages; Python sources write the character as `\u2014` inside regexes), and **grep every file you wrote (not the diff) for the em-dash character before committing**: `grep -rn $'\u2014' <files>` must print nothing.
- Beat sentence indices (`s:`) come from `node scripts/list-vo-sentences.mjs` output, never counted by hand.
- Nothing is pushed or deployed. Local commits on branch `feat/training-videos` only.
- Reference for porting: `~/projects/listing-stack-headshot/scripts/lib/record-core.mjs`, `lib/cursor-overlay.mjs`, `lib/training.mjs`, `build-synced-video.mjs`, `list-vo-sentences.mjs`, `check-beat-annotations.mjs`, `generate-training-vo.py`. Read the matching original before each port; its comments record real failures.

---

### Task 1: Branch, scaffolding, and `lib/training.mjs`

**Files:**
- Modify: `.gitignore`
- Create: `scripts/lib/training.mjs`
- Test: `scripts/lib/training.test.mjs`
- Create: `docs/training-videos/README.md`

**Interfaces:**
- Produces: `TRAINING_ROOT`, `rawDir(slug)`, `voDir(slug)`, `workDir(slug)`, `outDir()`, `qcDir(slug)`, `validateWalkthrough(w, slug)`, `loadWalkthrough(slug)`, `sectionClipPath(slug, sectionId)`, `mmss(seconds)`.
- Walkthrough shape (every later task relies on it):
  ```js
  export const WALKTHROUGH = {
    slug: "getting-started",
    title: "Getting Started",           // title card text
    guideAnchor: "productions",         // /guide#<anchor>
    sections: [{
      id: "welcome",                    // take dir name, unique per video
      heading: "Welcome",               // matches the script's ## header text
      targetSeconds: 25,                // minimum take length
      prep: async (api) => {},          // optional, off-camera, api = createDemoApi(...)
      run: async (page, h) => {},       // choreography, h = recorder helpers
    }],
  };
  ```

- [ ] **Step 1: Branch and gitignore**

```bash
git -C /Users/jarvis/projects/customers/nada-costume fetch
git -C /Users/jarvis/projects/customers/nada-costume switch -c feat/training-videos main   # local main carries the unpushed spec and plan commits
printf '\n# Training video footage, audio, and builds (regenerable from scripts/)\nrecordings/\n' >> /Users/jarvis/projects/customers/nada-costume/.gitignore
```

- [ ] **Step 2: Write the failing test**

`scripts/lib/training.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { validateWalkthrough, mmss, rawDir, voDir } from "./training.mjs";

const ok = () => ({
  slug: "demo",
  title: "Demo",
  guideAnchor: "productions",
  sections: [
    { id: "a", heading: "A", targetSeconds: 10, run: async () => {} },
    { id: "b", heading: "B", targetSeconds: 5, prep: async () => {}, run: async () => {} },
  ],
});

describe("validateWalkthrough", () => {
  it("accepts a well-formed walkthrough", () => {
    expect(() => validateWalkthrough(ok(), "demo")).not.toThrow();
  });
  it("rejects a slug mismatch", () => {
    expect(() => validateWalkthrough(ok(), "other")).toThrow(/slug "other"/);
  });
  it("rejects a missing title", () => {
    const w = ok();
    delete w.title;
    expect(() => validateWalkthrough(w, "demo")).toThrow(/title/);
  });
  it("rejects duplicate section ids", () => {
    const w = ok();
    w.sections[1].id = "a";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/duplicate section id "a"/);
  });
  it("rejects a non-positive targetSeconds", () => {
    const w = ok();
    w.sections[0].targetSeconds = 0;
    expect(() => validateWalkthrough(w, "demo")).toThrow(/targetSeconds/);
  });
  it("rejects a prep that is not a function", () => {
    const w = ok();
    w.sections[1].prep = "nope";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/prep/);
  });
  it("rejects a section id that is not a safe dir name", () => {
    const w = ok();
    w.sections[0].id = "../x";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/id/);
  });
});

describe("mmss", () => {
  it("rounds the total before splitting", () => {
    expect(mmss(359.6)).toBe("6:00");
    expect(mmss(61.2)).toBe("1:01");
  });
});

describe("paths", () => {
  it("builds per-video dirs under recordings/training", () => {
    expect(rawDir("x")).toBe("recordings/training/raw/x");
    expect(voDir("x")).toBe("recordings/training/vo/x");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run scripts/lib/training.test.mjs`
Expected: FAIL, cannot resolve `./training.mjs`.

- [ ] **Step 4: Implement `scripts/lib/training.mjs`**

```js
// Shared plumbing for the training-video pipeline: where footage lives, how
// walkthrough modules load, and the section contract the recorder and the
// builder both consume. Free of playwright/ffmpeg imports so it stays
// unit-testable. Ported (desktop only) from listing-stack-headshot.
import { readdirSync, statSync } from "node:fs";

export const TRAINING_ROOT = "recordings/training";
export const rawDir = (slug) => `${TRAINING_ROOT}/raw/${slug}`;
export const voDir = (slug) => `${TRAINING_ROOT}/vo/${slug}`;
export const workDir = (slug) => `${TRAINING_ROOT}/work/${slug}`;
export const outDir = () => `${TRAINING_ROOT}/out`;
export const qcDir = (slug) => `${TRAINING_ROOT}/qc/${slug}`;

const SAFE_ID = /^[a-z0-9-]+$/;

/** Throws on the first structural problem, naming the section. */
export function validateWalkthrough(w, slug) {
  if (!w || w.slug !== slug) throw new Error(`walkthrough must export WALKTHROUGH with slug "${slug}"`);
  for (const field of ["title", "guideAnchor"]) {
    if (typeof w[field] !== "string" || !w[field]) throw new Error(`${slug}: missing string ${field}`);
  }
  if (!Array.isArray(w.sections) || w.sections.length === 0) throw new Error(`${slug}: sections must be a non-empty array`);
  const ids = new Set();
  for (const s of w.sections) {
    if (typeof s.id !== "string" || !SAFE_ID.test(s.id)) throw new Error(`${slug}: section id "${s.id}" must match ${SAFE_ID}`);
    if (typeof s.heading !== "string" || !s.heading) throw new Error(`${slug}/${s.id}: missing string heading`);
    if (!Number.isFinite(s.targetSeconds) || s.targetSeconds <= 0) throw new Error(`${slug}/${s.id}: targetSeconds must be a positive number`);
    if (typeof s.run !== "function") throw new Error(`${slug}/${s.id}: run must be a function`);
    if (s.prep !== undefined && typeof s.prep !== "function") throw new Error(`${slug}/${s.id}: prep must be a function when present`);
    if (ids.has(s.id)) throw new Error(`${slug}: duplicate section id "${s.id}"`);
    ids.add(s.id);
  }
  return w;
}

export async function loadWalkthrough(slug) {
  // A leading underscore marks a verification-only walkthrough (e.g. _probe).
  if (!/^_?[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid walkthrough slug "${slug}"`);
  let mod;
  try {
    mod = await import(`./walkthroughs/${slug}.mjs`);
  } catch (err) {
    throw new Error(`No walkthrough at scripts/lib/walkthroughs/${slug}.mjs (${err.message})`);
  }
  return validateWalkthrough(mod.WALKTHROUGH, slug);
}

/** The one .webm in a section's take dir. A retake replaces the dir, so
 * "newest by mtime" and "the only one" coincide. Throws with the fix. */
export function sectionClipPath(slug, sectionId) {
  const dir = `${rawDir(slug)}/${sectionId}`;
  let entries = [];
  try {
    entries = readdirSync(dir).filter((n) => n.endsWith(".webm"));
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    throw new Error(`No take for "${slug}/${sectionId}". Run: node scripts/record-training-video.mjs --video ${slug} --section ${sectionId}`);
  }
  entries.sort((a, b) => statSync(`${dir}/${b}`).mtimeMs - statSync(`${dir}/${a}`).mtimeMs);
  return `${dir}/${entries[0]}`;
}

/** m:ss. Round the TOTAL first, or 359.6s prints "5:60". */
export function mmss(totalSeconds) {
  const whole = Math.round(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/training.test.mjs`
Expected: PASS.

- [ ] **Step 6: Write `docs/training-videos/README.md`** (runbook skeleton; later tasks append their commands)

```markdown
# Training videos

Spec: `docs/superpowers/specs/2026-09-22-training-videos-design.md`.

Pipeline, in order, for one video `<slug>`:

1. Script: `docs/training-videos/scripts/<slug>.md` (Chris approves before recording).
2. Narration: `~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video <slug>`
3. Sentence indices for `s:` annotations: `node scripts/list-vo-sentences.mjs --video <slug>`
4. Demo data: `node scripts/seed-demo-org.mjs` (server running, see below)
5. Record: `node scripts/record-training-video.mjs --video <slug> [--section <id>]`
6. Build: `node scripts/build-training-video.mjs --video <slug>`
7. QC: `node scripts/qc-training-video.mjs --video <slug>`, then look at every image it writes.

Server for steps 4 and 5: `npm run build && npm start` (port 6100). Never `next dev`.
Outputs land in `recordings/training/` (gitignored).
```

- [ ] **Step 7: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/training.mjs scripts/lib/training.test.mjs docs/training-videos/README.md .gitignore
git add .gitignore scripts/lib/training.mjs scripts/lib/training.test.mjs docs/training-videos/README.md
git commit -m "feat(training): walkthrough contract and paths for the training video pipeline"
```

The grep must print nothing before the commit.

---

### Task 2: Pure per-beat sync planner `lib/sync-plan.mjs`

Extracts the time-warp from `listing-stack-headshot/scripts/build-synced-video.mjs` (lines "Per-section plan" through the pause trim) into pure, tested functions. Behavior must match the original; read it side by side.

**Files:**
- Create: `scripts/lib/sync-plan.mjs`
- Test: `scripts/lib/sync-plan.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SYNC` constants (frozen object, values below).
  - `narrationLayout(paragraphSeconds: number[], { first: boolean }) -> { paraAt: number[], narrEnd: number, outDur: number }` (section-relative seconds; the first section's narration starts on the title card so its `paraAt[0]` is negative).
  - `flattenSentences(paragraphSeconds, paraAt, byPara) -> Array<{ start, end, text, words: Array<{ text, start, end }> }>` (section-relative seconds). `byPara` is the parsed `sentences.json` (`{ pNN: [{ i, start, end, text, words }] }`) or `null`.
  - `prepareMarkers(beats, room) -> beats` with `t` shifted to trimmed time, filtered, sorted.
  - `planSegments({ markers, sentences, room, outDur }) -> Array<{ start, end, factor, freeze }>` where `start`/`end` are CLIP-ABSOLUTE seconds (head trim included).
  - `finalizeSection(segs, narrEnd, outDur) -> { segs, actual, pause }` (does not mutate its input).
  - `segOutDuration(seg) -> number`.
  - `rawToOut(segs, clipT) -> number | null` (section-relative output seconds for a clip-absolute time, `null` if that time was trimmed away).

- [ ] **Step 1: Write the failing test**

`scripts/lib/sync-plan.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import {
  SYNC, narrationLayout, flattenSentences, prepareMarkers,
  planSegments, finalizeSection, rawToOut, segOutDuration,
} from "./sync-plan.mjs";

describe("narrationLayout", () => {
  it("starts later sections after the lead-in and gaps paragraphs", () => {
    const { paraAt, narrEnd, outDur } = narrationLayout([2, 3], { first: false });
    expect(paraAt[0]).toBeCloseTo(SYNC.LEAD_IN_S);
    expect(paraAt[1]).toBeCloseTo(SYNC.LEAD_IN_S + 2 + SYNC.MIN_GAP_S);
    expect(narrEnd).toBeCloseTo(SYNC.LEAD_IN_S + 5 + SYNC.MIN_GAP_S);
    expect(outDur).toBeCloseTo(narrEnd + SYNC.TAIL_S);
  });
  it("starts the first section on the title card (negative time)", () => {
    const { paraAt } = narrationLayout([2], { first: true });
    expect(paraAt[0]).toBeCloseTo(SYNC.CARD_NARR_START_S - SYNC.CARD_S);
  });
});

describe("flattenSentences", () => {
  it("offsets sentence and word times by paragraph start", () => {
    const byPara = { p00: [{ i: 0, start: 0.1, end: 1, text: "Hi there.", words: [{ text: "Hi", start: 0.1, end: 0.4 }] }] };
    const out = flattenSentences([1.2], [0.5], byPara);
    expect(out[0].start).toBeCloseTo(0.6);
    expect(out[0].words[0].start).toBeCloseTo(0.6);
  });
  it("falls back to one sentence per paragraph without timings", () => {
    const out = flattenSentences([2], [0.5], null);
    expect(out).toEqual([{ start: 0.5, end: 2.5, text: "", words: [] }]);
  });
});

describe("prepareMarkers", () => {
  it("shifts by the head trim, drops edges, sorts", () => {
    const beats = [{ t: 5, s: 1 }, { t: 0.8, s: 0 }, { t: 2, s: 0 }];
    const out = prepareMarkers(beats, 10);
    expect(out.map((m) => m.t)).toEqual([2 - SYNC.HEAD_TRIM_S, 5 - SYNC.HEAD_TRIM_S]);
  });
});

describe("planSegments", () => {
  const sentences = [{ start: 0, end: 2 }, { start: 3, end: 6 }];

  it("with no markers stretches the whole take into one segment", () => {
    const segs = planSegments({ markers: [], sentences, room: 10, outDur: 12 });
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(SYNC.HEAD_TRIM_S);
    expect(segs[0].end).toBeCloseTo(SYNC.HEAD_TRIM_S + 10);
    expect(segs[0].factor).toBeCloseTo(1.2);
  });

  it("trims (never speeds up) a trailing hold that is too long", () => {
    const segs = planSegments({ markers: [], sentences, room: 20, outDur: 10 });
    expect(segs[0].factor).toBe(1);
    expect(segs[0].end - segs[0].start).toBeCloseTo(10);
  });

  it("freezes instead of crawling past MAX_STRETCH", () => {
    const segs = planSegments({ markers: [{ t: 1, s: 0 }], sentences: [{ start: 0, end: 0.5 }], room: 2, outDur: 10 });
    const last = segs[segs.length - 1];
    expect(last.factor).toBeLessThanOrEqual(SYNC.MAX_STRETCH);
    expect(last.freeze).toBeGreaterThan(0);
  });

  it("pins a beat just after its sentence starts", () => {
    const segs = planSegments({ markers: [{ t: 4, s: 1 }], sentences, room: 10, outDur: 10 });
    expect(rawToOut(segs, 4 + SYNC.HEAD_TRIM_S)).toBeCloseTo(3 + SYNC.SHOW_LAG_S);
  });
});

describe("finalizeSection", () => {
  it("caps the silence after the last sentence at MAX_PAUSE_S", () => {
    const segs = planSegments({ markers: [{ t: 9, s: 0 }], sentences: [{ start: 0, end: 1 }], room: 10, outDur: 2.6 });
    const { actual, pause } = finalizeSection(segs, 2, 2.6);
    expect(pause).toBeCloseTo(SYNC.MAX_PAUSE_S, 1);
    expect(actual).toBeCloseTo(2 + SYNC.MAX_PAUSE_S, 1);
  });
  it("does not mutate its input", () => {
    const segs = planSegments({ markers: [], sentences, room: 30, outDur: 3 });
    const copy = JSON.parse(JSON.stringify(segs));
    finalizeSection(segs, 1, 3);
    expect(segs).toEqual(copy);
  });
});

describe("rawToOut", () => {
  it("is monotonic across segments and null outside them", () => {
    const segs = [
      { start: 1, end: 3, factor: 1, freeze: 0.5 },
      { start: 3, end: 5, factor: 2, freeze: 0 },
    ];
    expect(rawToOut(segs, 1)).toBe(0);
    expect(rawToOut(segs, 3)).toBeCloseTo(2);
    expect(rawToOut(segs, 4)).toBeCloseTo(2 + 0.5 + 2);
    expect(rawToOut(segs, 0.5)).toBeNull();
    expect(segOutDuration(segs[0])).toBeCloseTo(2.5);
  });
});
```

Note on `rawToOut(segs, 3)`: time 3 is the end of segment 0 and the start of segment 1; the function returns the first match, `2` (before segment 0's freeze). That is correct, since the freeze repeats the frame at time 3.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/sync-plan.test.mjs`
Expected: FAIL, cannot resolve `./sync-plan.mjs`.

- [ ] **Step 3: Implement `scripts/lib/sync-plan.mjs`**

```js
// Per-beat time warp for a training video section: raw-take spans are
// stretched so each beat (a recorder point() or zoom()) lands SHOW_LAG_S
// after the narration sentence it illustrates starts ("tell, then show").
// Audio is never warped; the footage follows the voice. Extracted as pure
// functions from listing-stack-headshot/scripts/build-synced-video.mjs,
// whose comments explain every constant (each was set after a real review).
export const SYNC = Object.freeze({
  HEAD_TRIM_S: 0.75,      // page-load flash at every take's head
  LEAD_IN_S: 0.5,         // quiet before a section's first sentence
  TAIL_S: 0.6,            // quiet after its last
  MIN_GAP_S: 0.35,        // between paragraphs
  SHOW_LAG_S: 0.55,       // a beat lands this long after its sentence starts
  MAX_LAG_FRACTION: 0.6,  // but never past this much of the sentence
  MIN_STRETCH: 0.62,      // fastest playback (about 1.6x)
  MAX_STRETCH: 1.8,       // slowest before freezing instead
  MIN_SEG_RAW_S: 0.3,     // ignore markers closer together than this
  MAX_PAUSE_S: 5.0,       // cap on dead air after a section's last sentence
  CARD_S: 3.0,            // title card length, both ends
  CARD_NARR_START_S: 0.8, // welcome narration starts on the intro card
});

export function narrationLayout(paragraphSeconds, { first }) {
  const start = first ? SYNC.CARD_NARR_START_S - SYNC.CARD_S : SYNC.LEAD_IN_S;
  const paraAt = [];
  let t = start;
  for (const dur of paragraphSeconds) {
    paraAt.push(t);
    t += dur + SYNC.MIN_GAP_S;
  }
  const narrEnd = t - SYNC.MIN_GAP_S;
  return { paraAt, narrEnd, outDur: Math.max(narrEnd + SYNC.TAIL_S, 1.0) };
}

export function flattenSentences(paragraphSeconds, paraAt, byPara) {
  const out = [];
  paragraphSeconds.forEach((dur, k) => {
    const list = byPara?.[`p${String(k).padStart(2, "0")}`];
    if (list?.length) {
      for (const s of list) {
        out.push({
          start: paraAt[k] + s.start,
          end: paraAt[k] + s.end,
          text: s.text,
          words: (s.words ?? []).map((w) => ({ text: w.text, start: paraAt[k] + w.start, end: paraAt[k] + w.end })),
        });
      }
    } else {
      out.push({ start: paraAt[k], end: paraAt[k] + dur, text: "", words: [] });
    }
  });
  return out;
}

export function prepareMarkers(beats, room) {
  return beats
    .map((b) => ({ ...b, t: b.t - SYNC.HEAD_TRIM_S }))
    .filter((m) => m.t > SYNC.MIN_SEG_RAW_S && m.t < room - SYNC.MIN_SEG_RAW_S)
    .sort((a, b) => a.t - b.t);
}

export function planSegments({ markers, sentences, room, outDur }) {
  const nB = markers.length;
  const nS = sentences.length;

  // Resolve each beat to a sentence. A declared s wins; otherwise spread
  // evenly (a guess, which the builder log flags).
  const resolved = [];
  for (let k = 0; k < nB; k++) {
    const declared = markers[k].s;
    const idx = Number.isInteger(declared)
      ? Math.min(declared, nS - 1)
      : Math.min(nS - 1, Math.round(((k + 0.5) * nS) / nB));
    if (sentences[idx]) resolved.push({ k, idx });
  }

  // Beats sharing one sentence are distributed across it, not stacked.
  const shareCount = new Map();
  for (const { idx } of resolved) shareCount.set(idx, (shareCount.get(idx) || 0) + 1);
  const seen = new Map();
  const pairs = [];
  for (const { k, idx } of resolved) {
    const sent = sentences[idx];
    const dur = sent.end - sent.start;
    const lag = Math.min(SYNC.SHOW_LAG_S, dur * SYNC.MAX_LAG_FRACTION);
    const m = shareCount.get(idx);
    const j = seen.get(idx) || 0;
    seen.set(idx, j + 1);
    const spread = m > 1 ? (j * Math.max(0, dur - lag)) / m : 0;
    pairs.push({ raw: markers[k].t, out: sent.start + lag + spread });
  }
  pairs.sort((a, b) => a.raw - b.raw);

  // Both axes strictly increasing: nudge, never drop.
  const pts = [{ raw: 0, out: 0 }];
  for (const p of pairs) {
    const prev = pts[pts.length - 1];
    const raw = Math.max(p.raw, prev.raw + SYNC.MIN_SEG_RAW_S);
    const out = Math.max(p.out, prev.out + 0.2);
    if (raw < room - SYNC.MIN_SEG_RAW_S && out < outDur - 0.2) pts.push({ raw, out });
  }
  pts.push({ raw: room, out: outDur });

  const segs = [];
  for (let j = 0; j < pts.length - 1; j++) {
    const rawDur = pts[j + 1].raw - pts[j].raw;
    const outWant = pts[j + 1].out - pts[j].out;
    if (rawDur <= 0.02 || outWant <= 0.02) continue;
    const start = pts[j].raw + SYNC.HEAD_TRIM_S;
    let end = pts[j + 1].raw + SYNC.HEAD_TRIM_S;
    let factor = outWant / rawDur;
    let freeze = 0;
    if (j === pts.length - 2 && factor < 1) {
      // Trailing static hold: trim it rather than speed it up.
      end = start + outWant;
      factor = 1;
    } else if (factor > SYNC.MAX_STRETCH) {
      factor = SYNC.MAX_STRETCH;
      freeze = outWant - rawDur * SYNC.MAX_STRETCH;
    } else if (factor < SYNC.MIN_STRETCH) {
      factor = SYNC.MIN_STRETCH;
    }
    segs.push({ start, end, factor, freeze });
  }
  return segs;
}

export function segOutDuration(seg) {
  return (seg.end - seg.start) * seg.factor + seg.freeze;
}

export function finalizeSection(inputSegs, narrEnd, outDur) {
  const segs = inputSegs.map((s) => ({ ...s }));
  const played = () => segs.reduce((a, s) => a + segOutDuration(s), 0);
  let actual = Math.max(played(), outDur);
  const last = segs[segs.length - 1];
  let over = actual - (narrEnd + SYNC.MAX_PAUSE_S);
  if (over > 0.05 && last) {
    const dropFreeze = Math.min(over, last.freeze);
    last.freeze -= dropFreeze;
    over -= dropFreeze;
    if (over > 0.05) {
      const spare = Math.max(0, last.end - last.start - SYNC.MIN_SEG_RAW_S);
      last.end -= Math.min(over / last.factor, spare);
    }
    actual = Math.max(played(), narrEnd + SYNC.TAIL_S);
  }
  return { segs, actual, pause: +(actual - narrEnd).toFixed(1) };
}

export function rawToOut(segs, clipT) {
  let acc = 0;
  for (const s of segs) {
    if (clipT >= s.start && clipT <= s.end) return acc + (clipT - s.start) * s.factor;
    acc += segOutDuration(s);
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/sync-plan.test.mjs`
Expected: PASS. If the MAX_PAUSE test is off, re-derive by hand against the original `build-synced-video.mjs` trim block before touching constants; the constants are fixed by the spec.

- [ ] **Step 5: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/sync-plan.mjs scripts/lib/sync-plan.test.mjs
git add scripts/lib/sync-plan.mjs scripts/lib/sync-plan.test.mjs
git commit -m "feat(training): pure per-beat sync planner extracted from the ListingStack builder"
```

---

### Task 3: Zoom math `lib/zoom.mjs`

**Files:**
- Create: `scripts/lib/zoom.mjs`
- Test: `scripts/lib/zoom.test.mjs`

**Interfaces:**
- Produces:
  - `ZOOM = { SCALE: 1.6, EASE_S: 0.4, MIN_HOLD_S: 0.5, FPS: 30, VIEW_W: 1920, VIEW_H: 1080 }`.
  - `zoomRect(box: {x,y,width,height}, scale, vw, vh) -> {x,y,w,h}` in viewport px, clamped inside the frame.
  - `zoomWindow(o0: number|null, o1: number|null, fps = ZOOM.FPS) -> { start: number, frames: number, easeFrames: number } | null` (`null` when too short or unmapped).
  - `zoomAt(frame, { frames, easeFrames, scale }) -> number` (JS mirror of the ffmpeg expression).
  - `zoompanFilter({ rect, scale, frames, easeFrames, vw, vh, outW, outH, fps }) -> string` (ffmpeg `zoompan=...`).

- [ ] **Step 1: Write the failing test**

`scripts/lib/zoom.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { ZOOM, zoomRect, zoomWindow, zoomAt, zoompanFilter } from "./zoom.mjs";

describe("zoomRect", () => {
  it("centers on the target box", () => {
    const r = zoomRect({ x: 900, y: 500, width: 120, height: 80 }, 1.6, 1920, 1080);
    expect(r.w).toBeCloseTo(1200);
    expect(r.h).toBeCloseTo(675);
    expect(r.x + r.w / 2).toBeCloseTo(960);
    expect(r.y + r.h / 2).toBeCloseTo(540);
  });
  it("clamps at the frame edges", () => {
    const r = zoomRect({ x: 5, y: 1050, width: 20, height: 20 }, 1.6, 1920, 1080);
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(1080 - 675);
  });
});

describe("zoomWindow", () => {
  it("returns null for an unmapped or too-short window", () => {
    expect(zoomWindow(null, 5)).toBeNull();
    expect(zoomWindow(1, 1.9)).toBeNull();
  });
  it("sizes ease frames from EASE_S", () => {
    const w = zoomWindow(2, 5);
    expect(w.start).toBe(2);
    expect(w.frames).toBe(90);
    expect(w.easeFrames).toBe(Math.round(ZOOM.EASE_S * ZOOM.FPS));
  });
});

describe("zoomAt", () => {
  const p = { frames: 90, easeFrames: 12, scale: 1.6 };
  it("eases in from 1, holds at scale, eases back out", () => {
    expect(zoomAt(0, p)).toBeCloseTo(1);
    expect(zoomAt(6, p)).toBeGreaterThan(1);
    expect(zoomAt(6, p)).toBeLessThan(1.6);
    expect(zoomAt(12, p)).toBeCloseTo(1.6);
    expect(zoomAt(50, p)).toBeCloseTo(1.6);
    expect(zoomAt(89, p)).toBeLessThan(1.02);
  });
});

describe("zoompanFilter", () => {
  it("emits a zoompan with the frame count, output size and fps", () => {
    const f = zoompanFilter({
      rect: { x: 360, y: 202.5, w: 1200, h: 675 }, scale: 1.6, frames: 90, easeFrames: 12,
      vw: 1920, vh: 1080, outW: 1920, outH: 1080, fps: 30,
    });
    expect(f.startsWith("zoompan=")).toBe(true);
    expect(f).toContain(":d=90:");
    expect(f).toContain(":s=1920x1080:");
    expect(f).toContain(":fps=30");
    expect(f).not.toMatch(/\bNaN\b|undefined/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/zoom.test.mjs`
Expected: FAIL, cannot resolve `./zoom.mjs`.

- [ ] **Step 3: Implement `scripts/lib/zoom.mjs`**

```js
// Zoom-in beats. The recorder captures a 2x still while the page holds still
// (recordVideo cannot record above CSS resolution, so zoomed video frames
// would be soft). The builder renders the whole zoom, ease in, hold, ease
// out, from that still with ffmpeg zoompan, then overlays it on the section
// at the output window the sync plan maps the hold to.
export const ZOOM = Object.freeze({ SCALE: 1.6, EASE_S: 0.4, MIN_HOLD_S: 0.5, FPS: 30, VIEW_W: 1920, VIEW_H: 1080 });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function zoomRect(box, scale, vw, vh) {
  const w = vw / scale;
  const h = vh / scale;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: clamp(cx - w / 2, 0, vw - w), y: clamp(cy - h / 2, 0, vh - h), w, h };
}

export function zoomWindow(o0, o1, fps = ZOOM.FPS) {
  if (o0 === null || o1 === null || o0 === undefined || o1 === undefined) return null;
  if (o1 - o0 < 2 * ZOOM.EASE_S + ZOOM.MIN_HOLD_S) return null;
  const frames = Math.round((o1 - o0) * fps);
  const easeFrames = Math.min(Math.round(ZOOM.EASE_S * fps), Math.floor(frames / 3));
  return { start: o0, frames, easeFrames };
}

function smooth(p) {
  return p * p * (3 - 2 * p);
}

export function zoomAt(frame, { frames, easeFrames, scale }) {
  let e;
  if (frame < easeFrames) e = smooth(frame / easeFrames);
  else if (frame < frames - easeFrames) e = 1;
  else e = smooth((frames - frame) / easeFrames);
  return 1 + (scale - 1) * e;
}

export function zoompanFilter({ rect, scale, frames, easeFrames, vw, vh, outW, outH, fps }) {
  const N = frames;
  const A = easeFrames;
  const S1 = +(scale - 1).toFixed(6);
  const fx = +((rect.x + rect.w / 2) / vw).toFixed(6);
  const fy = +((rect.y + rect.h / 2) / vh).toFixed(6);
  const inP = `(on/${A})`;
  const outP = `((${N}-on)/${A})`;
  const e = `if(lt(on,${A}),${inP}*${inP}*(3-2*${inP}),if(lt(on,${N - A}),1,${outP}*${outP}*(3-2*${outP})))`;
  const z = `1+${S1}*(${e})`;
  const p = `((zoom-1)/${S1})`;
  const x = `max(0,min(iw-iw/zoom,iw*(0.5+${p}*(${fx}-0.5))-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,ih*(0.5+${p}*(${fy}-0.5))-ih/zoom/2))`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=${N}:s=${outW}x${outH}:fps=${fps}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/zoom.test.mjs`
Expected: PASS.

- [ ] **Step 5: Prove the filter renders (smoke, no footage needed)**

```bash
mkdir -p recordings/training/work/_smoke
ffmpeg -v error -y -f lavfi -i testsrc2=s=3840x2160 -frames:v 1 recordings/training/work/_smoke/still.jpg
node -e 'import("./scripts/lib/zoom.mjs").then(({zoomRect,zoompanFilter})=>{const rect=zoomRect({x:900,y:500,width:120,height:80},1.6,1920,1080);process.stdout.write(zoompanFilter({rect,scale:1.6,frames:90,easeFrames:12,vw:1920,vh:1080,outW:1920,outH:1080,fps:30}))})' > recordings/training/work/_smoke/filter.txt
ffmpeg -v error -y -i recordings/training/work/_smoke/still.jpg -vf "$(cat recordings/training/work/_smoke/filter.txt)" -frames:v 90 -pix_fmt yuv420p recordings/training/work/_smoke/zoom.mp4 && echo RENDER-OK
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,nb_read_frames -of csv=p=0 recordings/training/work/_smoke/zoom.mp4
```

Expected: `RENDER-OK`, then `1920,1080,90`. Extract frames 0, 45 and 89 (`ffmpeg -i zoom.mp4 -vf "select=eq(n\,45)" -frames:v 1 f45.png`) and look at them: frame 0 is the full test pattern, frame 45 is zoomed about 1.6x on the center, frame 89 is nearly full. If the pan steps visibly between adjacent frames, report it; do not tune.

- [ ] **Step 6: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/zoom.mjs scripts/lib/zoom.test.mjs
git add scripts/lib/zoom.mjs scripts/lib/zoom.test.mjs
git commit -m "feat(training): zoom beat geometry and zoompan filter"
```

---

### Task 4: Captions `lib/captions.mjs`

**Files:**
- Create: `scripts/lib/captions.mjs`
- Test: `scripts/lib/captions.test.mjs`

**Interfaces:**
- Consumes: sentences shaped like `flattenSentences` output, with times already made absolute (video timeline) by the builder.
- Produces: `CAPTION`, `packCues(sentences) -> Array<{start,end,text}>`, `wrapLines(text, width) -> string[]`, `vttTime(seconds) -> "HH:MM:SS.mmm"`, `toWebVTT(cues) -> string`.

- [ ] **Step 1: Write the failing test**

`scripts/lib/captions.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { CAPTION, packCues, wrapLines, vttTime, toWebVTT } from "./captions.mjs";

const words = (text, start, step = 0.3) =>
  text.split(" ").map((t, i) => ({ text: t, start: start + i * step, end: start + i * step + 0.25 }));

describe("packCues", () => {
  it("never lets a cue span two sentences", () => {
    const cues = packCues([
      { words: words("Welcome to Measure My Costume.", 0) },
      { words: words("Let's begin.", 3) },
    ]);
    expect(cues.map((c) => c.text)).toEqual(["Welcome to Measure My Costume.", "Let's begin."]);
  });
  it("splits a long sentence at the two-line limit", () => {
    const long = "This sentence is deliberately long so that it cannot possibly fit inside a single caption cue of two lines";
    const cues = packCues([{ words: words(long, 0) }]);
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(CAPTION.LINE_CHARS * CAPTION.MAX_LINES);
  });
  it("lingers briefly but never overlaps the next cue", () => {
    const cues = packCues([{ words: words("One two.", 0) }, { words: words("Three four.", 0.7) }]);
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start);
  });
  it("skips sentences without word timings", () => {
    expect(packCues([{ words: [] }])).toEqual([]);
  });
});

describe("wrapLines", () => {
  it("keeps short text on one line", () => {
    expect(wrapLines("Short line.", 42)).toEqual(["Short line."]);
  });
  it("balances two lines within the width", () => {
    const lines = wrapLines("Create your first production and add the showings for it", 42);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
  });
});

describe("vttTime and toWebVTT", () => {
  it("formats hours, minutes, seconds, millis", () => {
    expect(vttTime(3723.4567)).toBe("01:02:03.457");
  });
  it("writes a valid WebVTT document", () => {
    const vtt = toWebVTT([{ start: 1, end: 2.5, text: "Hello there." }]);
    expect(vtt).toBe("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHello there.\n");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/captions.test.mjs`
Expected: FAIL, cannot resolve `./captions.mjs`.

- [ ] **Step 3: Implement `scripts/lib/captions.mjs`**

```js
// WebVTT captions from Ava's word timings. Cues never span a sentence
// boundary, hold at most two lines, and linger briefly after the last word
// without overlapping the next cue. Word text comes from the script (with
// punctuation); only the timing comes from the TTS engine.
export const CAPTION = Object.freeze({ LINE_CHARS: 42, MAX_LINES: 2, MIN_CUE_S: 1.0, LINGER_S: 0.3 });

export function packCues(sentences) {
  const cues = [];
  const limit = CAPTION.LINE_CHARS * CAPTION.MAX_LINES;
  for (const s of sentences) {
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") });
      cur = [];
    };
    for (const w of s.words ?? []) {
      const next = [...cur, w].map((x) => x.text).join(" ");
      if (cur.length && next.length > limit) flush();
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
  // No balanced split fits: greedy fill.
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/captions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/captions.mjs scripts/lib/captions.test.mjs
git add scripts/lib/captions.mjs scripts/lib/captions.test.mjs
git commit -m "feat(training): WebVTT captions from word timings"
```

---

### Task 5: Ava narration generator and sentence tools

**Files:**
- Create: `scripts/generate-training-vo.py`
- Create: `scripts/list-vo-sentences.mjs` (port)
- Create: `scripts/check-beat-annotations.mjs` (port)

**Interfaces:**
- Consumes: `docs/training-videos/scripts/<slug>.md`. Section headers are `## <Heading> (`<section-id>`)`. Paragraphs are separated by blank lines. Lines starting with `>` are director notes and are not spoken. Text before the first header is preamble and is not spoken.
- Produces, under `recordings/training/vo/<slug>/`:
  - `<section>/pNN.wav` (24 kHz mono s16, loudness-normalized)
  - `<section>/cache.json` `{ "pNN": { "text_sha": str, "voice": str, "rate": str, "pitch": str } }`
  - `<section>/sentences.json` `{ "pNN": [{ "i": int, "start": s, "end": s, "text": str, "words": [{ "text": str, "start": s, "end": s }] }] }` (seconds relative to the paragraph wav)
  - `manifest.json` `{ "<section-id>": [paragraph seconds, ...] }`

- [ ] **Step 1: Write `scripts/generate-training-vo.py`**

```python
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
```

- [ ] **Step 2: Run the selftest**

Run: `~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --selftest`
Expected: `selftest OK`.

- [ ] **Step 3: Live smoke render with a throwaway script**

```bash
mkdir -p docs/training-videos/scripts
printf '# Smoke\n\n## Smoke (`smoke`)\n\nWelcome to Measure My Costume. Let us create your first production.\n' > docs/training-videos/scripts/_smoke.md
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video _smoke
cat recordings/training/vo/_smoke/manifest.json recordings/training/vo/_smoke/smoke/sentences.json
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video _smoke
rm docs/training-videos/scripts/_smoke.md
rm -r recordings/training/vo/_smoke
```

Expected: the first run prints `render smoke/p00`, the manifest has one duration of about 4 to 5 s, and sentences.json has 2 sentences whose words carry punctuation ("Costume."). The second run prints no `render` line (cache hit). Listen to the wav once (`afplay recordings/training/vo/_smoke/smoke/p00.wav`) before deleting it.

- [ ] **Step 4: Port `scripts/list-vo-sentences.mjs`**

Copy `~/projects/listing-stack-headshot/scripts/list-vo-sentences.mjs` verbatim, then change only:
- the header comment path references: `docs/training-videos/scripts/<slug>.md` stays, and the example slug becomes `getting-started`;
- the section-order regex stays `^\s{4,6}id:\s*"([a-z0-9-]+)"` (our walkthroughs use the same indentation);
- replace every em-dash in the copied comments with a comma or a period.

- [ ] **Step 5: Port `scripts/check-beat-annotations.mjs`**

Copy the original verbatim, then change `BEAT_CALL` to include zoom beats:

```js
const BEAT_CALL = /h\.(point|zoom|navigateSlowly|openRecord)\s*\(/g;
```

Replace every em-dash in the copied comments. Skip files starting with `_` (already in the original).

- [ ] **Step 6: Verify both run on an empty tree**

Run: `node scripts/check-beat-annotations.mjs; echo EXIT=$?`
Expected: `0 annotated, 0 unannotated, 0 structural problem(s)` and `EXIT=0` (the walkthroughs dir may not exist yet; if the original throws ENOENT, guard `readdirSync` with `existsSync` and print the zero line).

- [ ] **Step 7: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/generate-training-vo.py scripts/list-vo-sentences.mjs scripts/check-beat-annotations.mjs
git add scripts/generate-training-vo.py scripts/list-vo-sentences.mjs scripts/check-beat-annotations.mjs
git commit -m "feat(training): Ava narration renderer with word timings, sentence index tools"
```

---

### Task 6: Demo org guard and one-time bootstrap

**Files:**
- Create: `scripts/lib/demo-org.mjs`
- Test: `scripts/lib/demo-org.test.mjs`
- Create: `scripts/lib/clerk-ticket.mjs`
- Create: `scripts/bootstrap-demo-org.mjs`
- Create (by running the bootstrap): `scripts/lib/demo-org.json`

**Interfaces:**
- Produces:
  - `DEMO_ORG_FILE = "scripts/lib/demo-org.json"`, `DEMO_ORG_NAME = "Demo Theatre Co."`
  - `readEnvLocal(path = ".env.local") -> Record<string,string>` and `loadEnvLocalIntoProcess()`
  - `loadDemoOrg(path?) -> { clerkUserId, clerkOrgId, email, name }` (throws if missing or malformed)
  - `assertLocalBase(base)`, `assertDevClerkKey(key)`, `assertDemoSession({ userId, orgId }, demo)`
  - `mintSignInTicket(clerkUserId) -> Promise<string>` in `clerk-ticket.mjs` (reads `process.env.CLERK_SECRET_KEY`, asserts dev key)

- [ ] **Step 1: Write the failing test**

`scripts/lib/demo-org.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLocalBase, assertDevClerkKey, assertDemoSession, loadDemoOrg, readEnvLocal } from "./demo-org.mjs";

const demo = { clerkUserId: "user_1", clerkOrgId: "org_1", email: "d@example.com", name: "Demo Theatre Co." };

describe("assertLocalBase", () => {
  it("allows localhost and 127.0.0.1", () => {
    expect(() => assertLocalBase("http://localhost:6100")).not.toThrow();
    expect(() => assertLocalBase("http://127.0.0.1:6100")).not.toThrow();
  });
  it("refuses anything else", () => {
    expect(() => assertLocalBase("https://www.measuremycostume.com")).toThrow(/localhost/);
  });
});

describe("assertDevClerkKey", () => {
  it("requires a dev (sk_test_) key", () => {
    expect(() => assertDevClerkKey("sk_test_abc")).not.toThrow();
    expect(() => assertDevClerkKey("sk_live_abc")).toThrow(/sk_test_/);
    expect(() => assertDevClerkKey(undefined)).toThrow(/sk_test_/);
  });
});

describe("assertDemoSession", () => {
  it("passes only for the demo user in the demo org", () => {
    expect(() => assertDemoSession({ userId: "user_1", orgId: "org_1" }, demo)).not.toThrow();
    expect(() => assertDemoSession({ userId: "user_1", orgId: "org_2" }, demo)).toThrow(/org_2/);
    expect(() => assertDemoSession({ userId: "user_9", orgId: "org_1" }, demo)).toThrow(/user_9/);
  });
});

describe("loadDemoOrg and readEnvLocal", () => {
  it("loads a valid file and rejects a partial one", () => {
    const d = mkdtempSync(join(tmpdir(), "demo-"));
    writeFileSync(join(d, "ok.json"), JSON.stringify(demo));
    writeFileSync(join(d, "bad.json"), JSON.stringify({ clerkUserId: "user_1" }));
    expect(loadDemoOrg(join(d, "ok.json"))).toEqual(demo);
    expect(() => loadDemoOrg(join(d, "bad.json"))).toThrow(/clerkOrgId/);
  });
  it("parses KEY=value lines", () => {
    const d = mkdtempSync(join(tmpdir(), "env-"));
    writeFileSync(join(d, ".env.local"), "A=1\n# c\nB_KEY= two \n");
    expect(readEnvLocal(join(d, ".env.local"))).toEqual({ A: "1", B_KEY: "two" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/demo-org.test.mjs`
Expected: FAIL, cannot resolve `./demo-org.mjs`.

- [ ] **Step 3: Implement `scripts/lib/demo-org.mjs`**

```js
// The training videos record as ONE dedicated demo user in ONE dedicated
// demo org. Dev and prod share a single Supabase database, so every script
// that writes (bootstrap, seeder, section preps, recorder) proves it is
// talking to localhost, a dev Clerk instance, and the demo org before it
// touches anything.
import { existsSync, readFileSync } from "node:fs";

export const DEMO_ORG_FILE = "scripts/lib/demo-org.json";
export const DEMO_ORG_NAME = "Demo Theatre Co.";

export function readEnvLocal(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function loadEnvLocalIntoProcess(path = ".env.local") {
  for (const [k, v] of Object.entries(readEnvLocal(path))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export function loadDemoOrg(path = DEMO_ORG_FILE) {
  if (!existsSync(path)) throw new Error(`${path} missing. Run: node scripts/bootstrap-demo-org.mjs`);
  const demo = JSON.parse(readFileSync(path, "utf8"));
  for (const k of ["clerkUserId", "clerkOrgId", "email", "name"]) {
    if (typeof demo[k] !== "string" || !demo[k]) throw new Error(`${path}: missing ${k}`);
  }
  return demo;
}

export function assertLocalBase(base) {
  const host = new URL(base).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing base ${base}: training scripts only run against localhost`);
  }
}

export function assertDevClerkKey(key) {
  if (typeof key !== "string" || !key.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a dev instance key (sk_test_...). Refusing.");
  }
}

export function assertDemoSession({ userId, orgId }, demo) {
  if (userId !== demo.clerkUserId) throw new Error(`Signed in as ${userId}, expected demo user ${demo.clerkUserId}`);
  if (orgId !== demo.clerkOrgId) throw new Error(`Active org is ${orgId}, expected demo org ${demo.clerkOrgId}`);
}
```

- [ ] **Step 4: Implement `scripts/lib/clerk-ticket.mjs`**

```js
// Clerk sign-in tickets for the demo user. A ticket-minted session JWT
// expires in about 60 seconds, so callers mint one immediately before use
// (see record-core.mjs). The token never leaves this process.
import { assertDevClerkKey } from "./demo-org.mjs";

export async function mintSignInTicket(clerkUserId) {
  const key = process.env.CLERK_SECRET_KEY;
  assertDevClerkKey(key);
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 300 }),
  });
  if (!res.ok) throw new Error(`mintSignInTicket: Clerk returned ${res.status}`);
  return (await res.json()).token;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/demo-org.test.mjs`
Expected: PASS.

- [ ] **Step 6: Implement `scripts/bootstrap-demo-org.mjs`**

```js
// One-time: creates the training-video demo user and org in the DEV Clerk
// instance, the organizations row, and a comped subscription, then writes
// scripts/lib/demo-org.json (committed; ids only, no secrets).
//
//   node scripts/bootstrap-demo-org.mjs
//
// Refuses to run if demo-org.json already exists: re-creating would orphan
// the old org's data. The demo org is dedicated; nothing else lives in it.
import { existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ORG_FILE, DEMO_ORG_NAME, assertDevClerkKey, loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";

const EMAIL = "demo-theatre+clerk_test@example.com";

if (existsSync(DEMO_ORG_FILE)) {
  console.error(`${DEMO_ORG_FILE} already exists. The demo org is set up; nothing to do.`);
  process.exit(1);
}
loadEnvLocalIntoProcess();
const key = process.env.CLERK_SECRET_KEY;
assertDevClerkKey(key);

async function clerk(method, path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const user = await clerk("POST", "/users", {
  email_address: [EMAIL],
  first_name: "Morgan",
  last_name: "Lee",
  skip_password_requirement: true,
  legal_accepted_at: new Date().toISOString(),
});
const org = await clerk("POST", "/organizations", { name: DEMO_ORG_NAME, created_by: user.id });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: orgErr } = await sb.from("organizations").upsert({ clerk_org_id: org.id, name: DEMO_ORG_NAME });
if (orgErr) throw new Error(`organizations upsert: ${orgErr.message}`);
const { error: subErr } = await sb.from("org_subscriptions").upsert({ org_id: org.id, comped: true });
if (subErr) throw new Error(`org_subscriptions upsert: ${subErr.message}`);

const demo = { clerkUserId: user.id, clerkOrgId: org.id, email: EMAIL, name: DEMO_ORG_NAME };
writeFileSync(DEMO_ORG_FILE, JSON.stringify(demo, null, 2) + "\n");
console.log(`Demo org ready: ${org.id} (user ${user.id}). Wrote ${DEMO_ORG_FILE}.`);
```

- [ ] **Step 7: Run it once and verify in the database**

Run: `node scripts/bootstrap-demo-org.mjs`
Expected: `Demo org ready: org_... (user user_...)`.

Verify through Supabase (SQL editor or MCP, under `set role postgres`): `select clerk_org_id, name from organizations where name = 'Demo Theatre Co.';` returns exactly one row, and `select comped from org_subscriptions where org_id = '<id>';` returns `true`. If Clerk rejects `legal_accepted_at` or the user fails to sign in later because of the legal-consent step, report the exact Clerk error; do not disable the consent setting.

- [ ] **Step 8: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/demo-org.mjs scripts/lib/demo-org.test.mjs scripts/lib/clerk-ticket.mjs scripts/bootstrap-demo-org.mjs scripts/lib/demo-org.json
git add scripts/lib/demo-org.mjs scripts/lib/demo-org.test.mjs scripts/lib/clerk-ticket.mjs scripts/bootstrap-demo-org.mjs scripts/lib/demo-org.json
git commit -m "feat(training): demo org guard and one-time dev Clerk bootstrap"
```

---

### Task 7: Demo fixtures and API-driven seeder

**Files:**
- Create: `scripts/lib/demo-fixtures.mjs`
- Test: `scripts/lib/demo-fixtures.test.mjs`
- Create: `scripts/lib/demo-api.mjs`
- Create: `scripts/seed-demo-org.mjs`

**Interfaces:**
- Consumes: `loadDemoOrg`, `assertLocalBase`, `assertDemoSession`, `loadEnvLocalIntoProcess` (Task 6); `mintSignInTicket` (Task 6).
- Produces:
  - `DEMO_PRODUCTIONS` (array, shape in code below), `MEASUREMENT_UNITS`, `showDate(offsetDays, today?) -> "YYYY-MM-DD"`, `validateFixtures(list)`.
  - `signInDemo(browser, base, demo, { viewport? }) -> Promise<{ context, page }>` (unrecorded, asserted demo session).
  - `createDemoApi(page) -> { get(path), post(path, body), put(path, body), patch(path, body), del(path) }` (throws on HTTP >= 400 with method, path, status, body excerpt).
  - `withDemoApi(browser, base, demo, fn) -> Promise<T>` (signs in, runs `fn(api)`, always closes the context).

- [ ] **Step 1: Write the failing test**

`scripts/lib/demo-fixtures.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { DEMO_PRODUCTIONS, MEASUREMENT_UNITS, showDate, validateFixtures } from "./demo-fixtures.mjs";

describe("showDate", () => {
  it("offsets from a given local day and formats YYYY-MM-DD", () => {
    expect(showDate(10, new Date(2026, 8, 22))).toBe("2026-10-02");
    expect(showDate(-1, new Date(2026, 0, 1))).toBe("2025-12-31");
  });
});

describe("DEMO_PRODUCTIONS", () => {
  it("passes validation", () => {
    expect(() => validateFixtures(DEMO_PRODUCTIONS)).not.toThrow();
  });
  it("uses only known measurement keys", () => {
    for (const p of DEMO_PRODUCTIONS) {
      for (const values of Object.values(p.measurements)) {
        for (const k of Object.keys(values)) expect(MEASUREMENT_UNITS).toHaveProperty(k);
      }
    }
  });
});

describe("validateFixtures", () => {
  it("rejects a casting for a role that does not exist", () => {
    const bad = [{ ...DEMO_PRODUCTIONS[0], cast: [{ role: "Nobody", performer: "X" }] }];
    expect(() => validateFixtures(bad)).toThrow(/Nobody/);
  });
  it("rejects measurements for a performer who is not cast", () => {
    const bad = [{ ...DEMO_PRODUCTIONS[0], measurements: { "Ghost Person": { height: 60 } } }];
    expect(() => validateFixtures(bad)).toThrow(/Ghost Person/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/demo-fixtures.test.mjs`
Expected: FAIL, cannot resolve `./demo-fixtures.mjs`.

- [ ] **Step 3: Implement `scripts/lib/demo-fixtures.mjs`**

Public-domain shows only (no licensing questions on camera). Performer names are fictional. Dates are computed relative to today so countdowns read realistically on camera.

```js
// Fixture data for the training-video demo org. Pure data plus validation;
// seed-demo-org.mjs pushes it through the app's API so every computed value
// on camera is what the product computes. Dates are offsets from "today".
export const MEASUREMENT_UNITS = Object.freeze({
  height: "in", weight: "lb", chest: "in", waist: "in", hips: "in", shoulder: "in",
  sleeve: "in", back_length: "in", inseam: "in", outseam: "in", neck: "in",
  arm_circumference: "in", wrist: "in", thigh: "in", knee: "in", head: "in", nape_to_floor: "in",
});

export function showDate(offsetDays, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const m = (height, chest, waist, hips, inseam, sleeve, neck, head) =>
  ({ height, chest, waist, hips, inseam, sleeve, neck, head });

export const DEMO_PRODUCTIONS = [
  {
    key: "midsummer",
    title: "A Midsummer Night's Dream",
    notes: "Fairy world in greens and golds; Athenians in muslin and cream.",
    active: true,
    showings: [
      { offsetDays: 42, time: "19:30", label: "Opening Night" },
      { offsetDays: 43, time: "19:30", label: null },
      { offsetDays: 44, time: "14:00", label: "Matinee" },
    ],
    roles: [
      { name: "Titania" }, { name: "Oberon" }, { name: "Puck" }, { name: "Bottom" },
      { name: "Hermia" }, { name: "Lysander" }, { name: "Helena" }, { name: "Demetrius" },
      { name: "Fairies", isEnsemble: true },
    ],
    cast: [
      { role: "Titania", performer: "Priya Natarajan" },
      { role: "Oberon", performer: "Marcus Ellery" },
      { role: "Puck", performer: "June Okafor" },
      { role: "Bottom", performer: "Theo Brandt" },
      { role: "Hermia", performer: "Lucia Moreno" },
      { role: "Lysander", performer: "Sam Whitfield" },
      { role: "Helena", performer: "Ava Lindqvist" },
      { role: "Demetrius", performer: "Rafael Costa" },
      { role: "Fairies", performer: "Nell Harper" },
      { role: "Fairies", performer: "Iris Chen" },
    ],
    measurements: {
      "Priya Natarajan": m(65, 34, 27, 37, 30, 22.5, 13, 21.5),
      "Marcus Ellery": m(72, 40, 33, 39, 32, 25, 15.5, 22.75),
      "June Okafor": m(61, 31, 25, 34, 27.5, 21, 12.5, 21),
      "Theo Brandt": m(69, 44, 38, 42, 30.5, 24, 16.5, 23),
      "Lucia Moreno": m(63, 33, 26, 36, 29, 22, 12.75, 21.25),
    },
  },
  {
    key: "pirates",
    title: "The Pirates of Penzance",
    notes: "Last spring's show. Pirate coats went back to House Inventory.",
    active: false,
    showings: [{ offsetDays: -150, time: "19:00", label: "Opening Night" }],
    roles: [{ name: "Pirate King" }, { name: "Frederic" }, { name: "Mabel" }, { name: "Ruth" }],
    cast: [
      { role: "Pirate King", performer: "Marcus Ellery" },
      { role: "Frederic", performer: "Sam Whitfield" },
      { role: "Mabel", performer: "Lucia Moreno" },
      { role: "Ruth", performer: "Nell Harper" },
    ],
    measurements: {},
  },
];

export function validateFixtures(list) {
  for (const p of list) {
    const roles = new Set(p.roles.map((r) => r.name));
    const cast = new Set(p.cast.map((c) => c.performer));
    for (const c of p.cast) {
      if (!roles.has(c.role)) throw new Error(`${p.key}: cast references unknown role "${c.role}"`);
    }
    for (const [who, values] of Object.entries(p.measurements)) {
      if (!cast.has(who)) throw new Error(`${p.key}: measurements for "${who}", who is not cast`);
      for (const k of Object.keys(values)) {
        if (!(k in MEASUREMENT_UNITS)) throw new Error(`${p.key}: unknown measurement key "${k}"`);
      }
    }
  }
  return list;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/demo-fixtures.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement `scripts/lib/demo-api.mjs`**

```js
// Drives the app's own API routes as the demo user from an UNRECORDED
// headless context. Used by the seeder and by walkthrough section preps, so
// fixture data is created exactly the way the product creates it.
import { mintSignInTicket } from "./clerk-ticket.mjs";
import { assertDemoSession, assertLocalBase } from "./demo-org.mjs";

export async function signInDemo(browser, base, demo, { viewport = { width: 1920, height: 1080 } } = {}) {
  assertLocalBase(base);
  const token = await mintSignInTicket(demo.clerkUserId);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${base}/sign-in?__clerk_ticket=${token}`);
  // A glob resolves before the redirect; wait on a predicate that excludes /sign-in.
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 20000 });
  let session = await page.evaluate(() => ({ userId: window.Clerk.user?.id ?? null, orgId: window.Clerk.organization?.id ?? null }));
  if (session.orgId !== demo.clerkOrgId) {
    await page.evaluate((id) => window.Clerk.setActive({ organization: id }), demo.clerkOrgId);
    session = await page.evaluate(() => ({ userId: window.Clerk.user?.id ?? null, orgId: window.Clerk.organization?.id ?? null }));
  }
  assertDemoSession(session, demo);
  return { context, page };
}

export function createDemoApi(page) {
  async function call(method, path, body) {
    const res = await page.evaluate(async ({ method, path, body }) => {
      const init = { method, headers: {} };
      if (body !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const r = await fetch(path, init);
      return { status: r.status, text: await r.text() };
    }, { method, path, body });
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text.slice(0, 300)}`);
    return res.text ? JSON.parse(res.text) : null;
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b ?? {}),
    put: (p, b) => call("PUT", p, b ?? {}),
    patch: (p, b) => call("PATCH", p, b ?? {}),
    del: (p) => call("DELETE", p),
  };
}

export async function withDemoApi(browser, base, demo, fn) {
  const { context, page } = await signInDemo(browser, base, demo);
  try {
    return await fn(createDemoApi(page));
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 6: Read the request bodies the seeder needs**

Before writing the seeder, read each route's body cast (the `as { ... }` after `request.json()`) and its success response, and write down the exact field names. The seeder below already matches these, verified 2026-09-22:
- `GET /api/productions` -> `{ productions }` for the active org.
- `POST /api/productions` body `{ title, notes, showings: [{ date, time, label }] }` -> `{ production }`; the route creates the default "Main Cast".
- `POST /api/productions/[id]/roles` body `{ names: string[] }` or `{ name, isEnsemble }` -> `{ roles }` / `{ role }`.
- `POST /api/productions/[id]/castings` body `{ castId, roleId, name }` -> `{ performer, casting }` (201). Check in `src/lib/data/castings.ts` whether a second casting of the same name reuses the performer (Marcus, Sam, Lucia, Nell appear in both shows, but in different productions).
- `PUT /api/performers/[performerId]/measurements` body `{ measurementKey, valueNumeric, unit }`.
- `GET /api/productions/[id]/casts` -> `{ casts }`.
- `PATCH /api/productions/[id]` body `{ isActive: boolean }` (what `ToggleProductionActiveButton.tsx` sends).

If any shape differs from the code below, fix the seeder to match the route. Never change a route to fit the seeder.

- [ ] **Step 7: Implement `scripts/seed-demo-org.mjs`**

```js
// Rebuilds the training-video demo org's fixtures through the app's API.
//
//   npm run build && npm start      (separate terminal, port 6100)
//   node scripts/seed-demo-org.mjs
//
// Deletes EVERY production in the demo org, then recreates DEMO_PRODUCTIONS.
// Safe only because the org is dedicated and every call is asserted to run
// as the demo user in the demo org (see lib/demo-api.mjs).
import { chromium } from "playwright";
import { loadDemoOrg, loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";
import { withDemoApi } from "./lib/demo-api.mjs";
import { DEMO_PRODUCTIONS, MEASUREMENT_UNITS, showDate, validateFixtures } from "./lib/demo-fixtures.mjs";

loadEnvLocalIntoProcess();
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:6100";
const demo = loadDemoOrg();
validateFixtures(DEMO_PRODUCTIONS);

const browser = await chromium.launch();
try {
  await withDemoApi(browser, BASE, demo, async (api) => {
    const { productions: existing } = await api.get("/api/productions");
    for (const p of existing) await api.del(`/api/productions/${p.id}`);
    console.log(`removed ${existing.length} production(s)`);

    for (const fx of DEMO_PRODUCTIONS) {
      const { production } = await api.post("/api/productions", {
        title: fx.title,
        notes: fx.notes,
        showings: fx.showings.map((s) => ({ date: showDate(s.offsetDays), time: s.time, label: s.label })),
      });
      const id = production.id;

      const plain = fx.roles.filter((r) => !r.isEnsemble).map((r) => r.name);
      const { roles: made } = await api.post(`/api/productions/${id}/roles`, { names: plain });
      const roleIds = new Map(made.map((r) => [r.name, r.id]));
      for (const r of fx.roles.filter((x) => x.isEnsemble)) {
        const { role } = await api.post(`/api/productions/${id}/roles`, { name: r.name, isEnsemble: true });
        roleIds.set(role.name, role.id);
      }

      const casts = await api.get(`/api/productions/${id}/casts`);
      const castId = casts.casts[0].id; // the default "Main Cast"

      const performerIds = new Map();
      for (const c of fx.cast) {
        const result = await api.post(`/api/productions/${id}/castings`, {
          castId,
          roleId: roleIds.get(c.role),
          name: c.performer, // assignment omitted: the route picks primary or ensemble from the role
        });
        // Reuse the id when the same person is cast twice; the route dedupes by name.
        performerIds.set(c.performer, result.performer.id);
      }

      for (const [who, values] of Object.entries(fx.measurements)) {
        const pid = performerIds.get(who);
        if (!pid) throw new Error(`${fx.key}: no performer id for ${who}`);
        for (const [key, value] of Object.entries(values)) {
          await api.put(`/api/performers/${pid}/measurements`, { measurementKey: key, valueNumeric: value, unit: MEASUREMENT_UNITS[key] });
        }
      }

      if (!fx.active) await api.patch(`/api/productions/${id}`, { isActive: false });
      console.log(`seeded ${fx.title}: ${fx.roles.length} roles, ${fx.cast.length} castings, ${Object.keys(fx.measurements).length} measured`);
    }

    const { productions: after } = await api.get("/api/productions");
    if (after.length !== DEMO_PRODUCTIONS.length) {
      throw new Error(`expected ${DEMO_PRODUCTIONS.length} productions after seeding, found ${after.length}`);
    }
    console.log("seed OK");
  });
} finally {
  await browser.close();
}
```

Response shapes verified 2026-09-22: `GET /api/productions` -> `{ productions }`, `GET .../casts` -> `{ casts }`, castings POST -> `{ performer, casting }`, PATCH takes `{ isActive }`. If Step 6 finds any drift, fix the seeder to match.

- [ ] **Step 8: Run the seeder twice (idempotence)**

In another terminal: `npm run build && npm start`. Then run `node scripts/seed-demo-org.mjs` twice.
Expected: both runs end `seed OK`; the second run reports `removed 2 production(s)`. Then open `http://localhost:6100` signed in as the demo user (or with `playwright-cli -s=nada`, following the ticket recipe in `docs/training-videos/README.md`) and confirm the two productions, the roles, the cast, and Priya Natarajan's measurements render. Take a screenshot and look at it.

- [ ] **Step 9: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/demo-fixtures.mjs scripts/lib/demo-fixtures.test.mjs scripts/lib/demo-api.mjs scripts/seed-demo-org.mjs
git add scripts/lib/demo-fixtures.mjs scripts/lib/demo-fixtures.test.mjs scripts/lib/demo-api.mjs scripts/seed-demo-org.mjs
git commit -m "feat(training): demo fixtures seeded through the app's own API"
```

---

### Task 8: Recorder (`record-core.mjs`, cursor overlay, page zoom, zoom beats)

**Files:**
- Create: `scripts/lib/cursor-overlay.mjs` (port, adapted)
- Create: `scripts/lib/record-core.mjs` (desktop-only port plus `zoom`)
- Create: `scripts/record-training-video.mjs` (port)
- Create: `scripts/lib/walkthroughs/_probe.mjs` (verification only; `_` files are skipped by the tools)

**Interfaces:**
- Consumes: `mintSignInTicket` (Task 6), `withDemoApi`, `signInDemo` (Task 7), `loadWalkthrough`, `rawDir` (Task 1), `ZOOM` (Task 3).
- Produces: `PAGE_ZOOM = 1.5`; `createRecorder({ browser, base, demo, outRoot })` returning helpers `h = { record, hold, type, point, zoom, gotoAuthed, navigateSlowly, openRecord, base }`.
- Marker file `recordings/training/raw/<slug>/<section>/markers.json`:
  ```json
  { "beats": [
    { "beat": 0, "t": 3.214, "ok": true, "s": 1 },
    { "beat": 1, "t": 7.9, "ok": true, "s": 3,
      "zoom": { "box": { "x": 812, "y": 402, "width": 160, "height": 44 }, "scale": 1.6, "holdS": 2.6, "still": "zoom-01.jpg" } }
  ] }
  ```
  `t` is seconds from the start of the raw clip. `box` is in viewport px (1920x1080 space).

- [ ] **Step 1: Port `scripts/lib/cursor-overlay.mjs`**

Copy the original. Change two things:
1. Divide event coordinates by the page zoom so the dot lands under the real pointer when `html { zoom: 1.5 }` is applied. Replace the `mousemove`, `mousedown` coordinate uses with:
   ```js
   const z = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
   // in mousemove:
   dot.style.left = e.clientX / z() + "px";
   dot.style.top = e.clientY / z() + "px";
   // in mousedown ring: use the same e.clientX / z(), e.clientY / z()
   ```
2. Remove the em-dashes from the copied comments.

Step 5 verifies the direction of this correction on real frames; if the dot is off by 1.5x, the fix is multiply instead of divide.

- [ ] **Step 2: Port `scripts/lib/record-core.mjs` (desktop only)**

From the original, keep: `assertImagesLoaded`, `createRecorder` with `record`, `hold`, `type`, `point`, `gotoAuthed`, `openRecord`, and `navigateSlowly` (desktop branch only). Drop: mobile capture (`captureFramesWhile`, `assembleFramesToWebm`, `navigateViaMobileDrawer`, all `isMobile` branches), `mintSignInTicket` (now in `clerk-ticket.mjs`), `warmImageCache` unless a section needs it later.

Adapt:
- `assertSignedIn(page, path)` waits for `header a[href="/productions"]` (AppNav renders it on every authed page) instead of `.app-shell`.
- Auth: `freshAuthedStorageState()` calls `signInDemo(browser, base, demo)` from `demo-api.mjs` (which asserts the demo session), takes `context.storageState()`, closes that context.
- `navigateSlowly(page, label, path, { s })` scopes the link lookup to `page.locator("header")` (nav labels are "Productions", "Inventory", "My Work").
- The recorded context:
  ```js
  export const PAGE_ZOOM = 1.5;
  const PAGE_ZOOM_INIT = `
    (() => {
      const apply = () => { document.documentElement.style.zoom = "${PAGE_ZOOM}"; };
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    })();
  `;
  // inside record():
  const ctx = await browser.newContext({
    viewport: { width: ZOOM.VIEW_W, height: ZOOM.VIEW_H },
    deviceScaleFactor: 2, // zoom stills only; recordVideo stays 1920x1080
    recordVideo: { dir, size: { width: ZOOM.VIEW_W, height: ZOOM.VIEW_H } },
    colorScheme: "light",
    storageState,
  });
  await ctx.addInitScript(PAGE_ZOOM_INIT);
  await ctx.addInitScript(CURSOR_INIT_SCRIPT);
  ```
- `markers.json` is written as `{ beats: [...] }` with `t` rebased to page creation (as the original does for desktop), and each beat keeps its optional `zoom` object.
- Add the zoom helper (inside `createRecorder`, next to `point`):
  ```js
  /** Zoom beat: park the cursor on the target, capture a sharp 2x still while
   * the page holds still, and record the hold window. The builder renders the
   * whole zoom (ease in, hold, ease out) from the still, so the page MUST NOT
   * change during holdMs. Best-effort like point(): a miss still emits the
   * beat (without zoom) so later s: alignment never shifts. */
  async function zoom(page, target, { s = null, scale = ZOOM.SCALE, holdMs = 2600, timeoutMs = 4000 } = {}) {
    const beat = markers.length;
    const at = Date.now();
    let info = null;
    try {
      const el = (typeof target === "string" ? page.locator(target) : target).first();
      await point(page, el, { mark: false, timeoutMs });
      await page.waitForTimeout(250); // cursor glide settles
      const box = await el.boundingBox({ timeout: timeoutMs });
      if (!box) throw new Error("no bounding box");
      const still = `zoom-${String(beat).padStart(2, "0")}.jpg`;
      await page.screenshot({ path: `${currentDir}/${still}`, type: "jpeg", quality: 92, scale: "device" });
      info = { box, scale, holdS: holdMs / 1000, still };
    } catch (err) {
      console.warn(`  zoom(): no zoom captured, ${err.message.split("\n")[0]}`);
    }
    await page.waitForTimeout(holdMs);
    markers.push({ beat, at, ok: info !== null, s, ...(info ? { zoom: info } : {}) });
  }
  ```
  `currentDir` is the take dir `record()` created (store it in a closure variable when `record()` starts). Note `at` is taken before the cursor glide; the builder starts the zoom window 0.15 s after `t`, and the still is captured about 0.5 s after `t`. Zoom stills are only valid if nothing on screen changes from `t` until `t + holdS`: sections call `h.zoom` only on settled screens.
- Remove every em-dash from ported comments.

- [ ] **Step 3: Port `scripts/record-training-video.mjs`**

From the original: drop `--orientation`; replace `assertDevTarget` with `loadEnvLocalIntoProcess()`, `assertLocalBase(BASE)`, `assertDevClerkKey(process.env.CLERK_SECRET_KEY)`, `const demo = loadDemoOrg()`; `BASE` defaults to `http://localhost:6100`; the recorder is `createRecorder({ browser, base: BASE, demo, outRoot: rawDir(videoSlug) })`. Before each section, run its prep off camera:

```js
if (section.prep) await withDemoApi(browser, BASE, demo, (api) => section.prep(api));
```

Keep the targetSeconds padding and the per-section failure collection exactly as in the original. Also fail fast if the server is `next dev`: refuse when `.next/BUILD_ID` does not exist or is older than the newest file under `src/` (print both mtimes). This is the "prove the process is a production build" rule.

- [ ] **Step 4: Write the probe walkthrough `scripts/lib/walkthroughs/_probe.mjs`**

```js
// Verification-only walkthrough for Task 8. Not a training video.
export const WALKTHROUGH = {
  slug: "_probe",
  title: "Probe",
  guideAnchor: "productions",
  sections: [
    {
      id: "probe",
      heading: "Probe",
      targetSeconds: 8,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 1200);
        await h.point(page, page.getByRole("link", { name: /A Midsummer Night's Dream/ }), { s: 0 });
        await h.hold(page, 800);
        await h.zoom(page, page.getByRole("link", { name: /A Midsummer Night's Dream/ }), { s: 1, holdMs: 2000 });
      },
    },
  ],
};
```

`loadWalkthrough` accepts a leading underscore on the slug (Task 1), so `_probe` loads while the annotation tools skip it.

- [ ] **Step 5: Record the probe and verify on real frames**

With the production server running and the demo org seeded:

```bash
node scripts/record-training-video.mjs --video _probe
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 recordings/training/raw/_probe/probe/*.webm
cat recordings/training/raw/_probe/probe/markers.json
sips -g pixelWidth -g pixelHeight recordings/training/raw/_probe/probe/zoom-01.jpg
ffmpeg -v error -y -ss 4 -i recordings/training/raw/_probe/probe/*.webm -frames:v 1 recordings/training/work/_probe-frame.png
```

Expected and required, each checked by LOOKING at the images (Read tool):
1. The webm is `1920,1080`, and the frame shows the whole page at 1.5x layout (content column fills roughly half the frame width, not a thin strip, and nothing is cropped or padded gray). If the frame shows only the top-left quarter or gray padding, `deviceScaleFactor: 2` broke `recordVideo`: set `deviceScaleFactor: 1` for the recorded context and capture zoom stills from a second, unrecorded page is NOT acceptable (different state). Instead report the finding and stop; the controller decides.
2. `zoom-01.jpg` is 3840x2160 and sharp, and the production link is visible in it.
3. The amber cursor dot sits ON the link in the extracted frame (checks the Step 1 zoom correction). If it is offset toward the top-left by a factor of 1.5, switch divide to multiply in `cursor-overlay.mjs` and re-record.
4. `markers.json` has 2 beats; beat 1 carries `zoom.box` whose center, scaled by 2, falls on the link in `zoom-01.jpg`.
5. Open the Clerk UserButton menu in a quick manual `playwright-cli` session with `html{zoom:1.5}` applied and confirm the popover renders next to the button (not offset). If Clerk popovers misplace under CSS zoom, report it; the spec's fallback (1280x720 viewport upscaled) is the controller's call.

- [ ] **Step 6: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/cursor-overlay.mjs scripts/lib/record-core.mjs scripts/record-training-video.mjs scripts/lib/walkthroughs/_probe.mjs scripts/lib/training.mjs scripts/lib/training.test.mjs
npx vitest run scripts
git add scripts/lib/cursor-overlay.mjs scripts/lib/record-core.mjs scripts/record-training-video.mjs scripts/lib/walkthroughs/_probe.mjs
git commit -m "feat(training): desktop recorder with 1.5x page zoom, cursor overlay, and zoom beats"
```

Include in the report: the five verification results, each with the image path looked at.

---

### Task 9: Title card and `build-training-video.mjs`

**Files:**
- Create: `scripts/lib/title-card.mjs`
- Test: `scripts/lib/title-card.test.mjs`
- Create: `scripts/build-training-video.mjs`

**Interfaces:**
- Consumes: Tasks 1 to 4 (`loadWalkthrough`, `sectionClipPath`, `voDir`, `workDir`, `outDir`, `mmss`; everything in `sync-plan.mjs`; `ZOOM`, `zoomRect`, `zoomWindow`, `zoompanFilter`; `packCues`, `toWebVTT`); VO files from Task 5; raw takes and `markers.json` from Task 8.
- Produces: `recordings/training/out/<slug>.mp4`, `<slug>.vtt`, `<slug>.sync.json` (`{ sections: [{ id, start, end }], beats: [{ section, beat, at, sentence, text }], zooms: [{ section, start, end }] }`, all in seconds on the final timeline); `titleCardHtml({ title, subtitle }) -> string`, `renderTitleCard(browser, { title, subtitle }, outPath)`.

- [ ] **Step 1: Write the failing title-card test**

`scripts/lib/title-card.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { titleCardHtml } from "./title-card.mjs";

describe("titleCardHtml", () => {
  it("contains the title and subtitle, escaped", () => {
    const html = titleCardHtml({ title: "Roles & <Cast>", subtitle: "Measure My Costume training" });
    expect(html).toContain("Roles &amp; &lt;Cast&gt;");
    expect(html).toContain("Measure My Costume training");
    expect(html).not.toContain("<Cast>");
  });
  it("uses the app palette", () => {
    const html = titleCardHtml({ title: "T", subtitle: "S" });
    expect(html).toContain("#f4ecdd");
    expect(html).toContain("#c62828");
    expect(html).toContain("#241c19");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/title-card.test.mjs`
Expected: FAIL, cannot resolve `./title-card.mjs`.

- [ ] **Step 3: Implement `scripts/lib/title-card.mjs`**

```js
// Title card for the start and end of each training video, rendered by
// Chromium from HTML so it uses the app's real fonts (Fraunces, Hanken
// Grotesk) and palette tokens from src/app/globals.css (--bg, --ink, --red).
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function titleCardHtml({ title, subtitle }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1920px;height:1080px;background:#f4ecdd;color:#241c19}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center}
  h1{font-family:Fraunces,serif;font-weight:600;font-size:112px;margin:0;letter-spacing:-1px}
  .rule{width:220px;height:6px;background:#c62828;margin:40px 0 36px;border-radius:3px}
  p{font-family:"Hanken Grotesk",sans-serif;font-weight:500;font-size:40px;margin:0;opacity:.8}
</style></head><body>
  <h1>${esc(title)}</h1><div class="rule"></div><p>${esc(subtitle)}</p>
</body></html>`;
}

export async function renderTitleCard(browser, { title, subtitle }, outPath) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.setContent(titleCardHtml({ title, subtitle }), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => document.fonts.check('600 112px Fraunces'));
  if (!loaded) throw new Error("Fraunces did not load; title card would fall back to a system serif");
  await page.screenshot({ path: outPath });
  await ctx.close();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/title-card.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement `scripts/build-training-video.mjs`**

```js
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

const W = ZOOM.VIEW_W;
const H = ZOOM.VIEW_H;
const FPS = ZOOM.FPS;

const args = process.argv.slice(2);
const slug = args[args.indexOf("--video") + 1];
if (!args.includes("--video") || !slug) {
  console.error("Usage: node scripts/build-training-video.mjs --video <slug>");
  process.exit(1);
}

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
  const sentences = flattenSentences(paragraphs, paraAt, existsSync(sentPath) ? JSON.parse(readFileSync(sentPath, "utf8")) : null);
  const markersPath = `${takeDir}/markers.json`;
  if (!existsSync(markersPath)) throw new Error(`${slug}/${s.id}: no markers.json, re-record the section`);
  const rawBeats = JSON.parse(readFileSync(markersPath, "utf8")).beats ?? [];
  const markers = prepareMarkers(rawBeats, room);
  const { segs, actual, pause } = finalizeSection(planSegments({ markers, sentences, room, outDur }), narrEnd, outDur);
  return { id: s.id, clip, takeDir, paragraphs, paraAt, narrEnd, sentences, rawBeats, markers, segs, actual, pause };
});

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
```

A note on the first card: both uses of the card come from one looped 3 s input split in two, so the input's `-t` bounds both copies.

- [ ] **Step 6: Build the probe end to end**

```bash
mkdir -p docs/training-videos/scripts
printf '# Probe\n\n## Probe (`probe`)\n\nHere is the productions list. Every show you are costuming lives here.\n' > docs/training-videos/scripts/_probe.md
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video _probe
node scripts/list-vo-sentences.mjs --video _probe
node scripts/build-training-video.mjs --video _probe
ffprobe -v error -show_entries stream=codec_type,width,height:format=duration -of compact recordings/training/out/_probe.mp4
cat recordings/training/out/_probe.vtt recordings/training/out/_probe.sync.json
```

Expected: an MP4 with one 1920x1080 video stream and one audio stream, duration about 3 + narration + 3 s. The VTT has cues matching the two sentences. `sync.json` has one zoom. Extract a frame at the middle of the zoom window and one at 1 s (title card); LOOK at both. The zoom frame must be sharp (text edges crisp, not blurry) and centered on the production link. Then play the file once (`open recordings/training/out/_probe.mp4`) and confirm the voice starts on the title card and the captions (load the .vtt in QuickTime or VLC) track the words.

Then remove the probe script: `rm docs/training-videos/scripts/_probe.md` (keep `_probe.mjs` committed as the recorder smoke test).

- [ ] **Step 7: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/title-card.mjs scripts/lib/title-card.test.mjs scripts/build-training-video.mjs
npx vitest run scripts
git add scripts/lib/title-card.mjs scripts/lib/title-card.test.mjs scripts/build-training-video.mjs
git commit -m "feat(training): narrated builder with beat sync, zoom overlays, title card, captions"
```

---

### Task 10: QC script

**Files:**
- Create: `scripts/lib/qc.mjs`
- Test: `scripts/lib/qc.test.mjs`
- Create: `scripts/qc-training-video.mjs`

**Interfaces:**
- Consumes: `recordings/training/out/<slug>.mp4` and `<slug>.sync.json` (Task 9), `qcDir` (Task 1).
- Produces: `parseFreezes(text) -> Array<{ start, duration }>`, `unexplainedFreezes(freezes, sidecar, { cardS, totalS }) -> freezes` (drops freezes that overlap a zoom window or a title card); image files under `recordings/training/qc/<slug>/`.

- [ ] **Step 1: Write the failing test**

`scripts/lib/qc.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { parseFreezes, unexplainedFreezes } from "./qc.mjs";

const log = [
  "frame:10 pts:10 pts_time:0.33",
  "lavfi.freezedetect.freeze_start=12.5",
  "lavfi.freezedetect.freeze_duration=7.2",
  "lavfi.freezedetect.freeze_end=19.7",
  "lavfi.freezedetect.freeze_start=40",
  "lavfi.freezedetect.freeze_duration=6.5",
  "lavfi.freezedetect.freeze_end=46.5",
].join("\n");

describe("parseFreezes", () => {
  it("pairs starts with durations", () => {
    expect(parseFreezes(log)).toEqual([{ start: 12.5, duration: 7.2 }, { start: 40, duration: 6.5 }]);
  });
  it("keeps an unterminated freeze at the end with a null duration", () => {
    expect(parseFreezes("lavfi.freezedetect.freeze_start=3")).toEqual([{ start: 3, duration: null }]);
  });
});

describe("unexplainedFreezes", () => {
  it("drops freezes inside zooms or title cards", () => {
    const sidecar = { zooms: [{ start: 12, end: 20 }] };
    const out = unexplainedFreezes(parseFreezes(log), sidecar, { cardS: 3, totalS: 60 });
    expect(out).toEqual([{ start: 40, duration: 6.5 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/lib/qc.test.mjs`
Expected: FAIL, cannot resolve `./qc.mjs`.

- [ ] **Step 3: Implement `scripts/lib/qc.mjs`**

```js
// Pure helpers for training-video QC. A long freeze is not proof of a bug
// (a zoom hold or a title card is static by design), but an UNEXPLAINED one
// usually is: footage that stopped while narration kept going.
export function parseFreezes(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const s = line.match(/freeze_start=([\d.]+)/);
    if (s) out.push({ start: Number(s[1]), duration: null });
    const d = line.match(/freeze_duration=([\d.]+)/);
    if (d && out.length) out[out.length - 1].duration = Number(d[1]);
  }
  return out;
}

export function unexplainedFreezes(freezes, sidecar, { cardS, totalS }) {
  const explained = [
    { start: 0, end: cardS },
    { start: totalS - cardS, end: totalS },
    ...(sidecar.zooms ?? []).map((z) => ({ start: z.start, end: z.end })),
  ];
  return freezes.filter((f) => {
    const end = f.start + (f.duration ?? 0);
    return !explained.some((e) => f.start >= e.start - 0.5 && end <= e.end + 0.5);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/qc.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement `scripts/qc-training-video.mjs`**

```js
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
```

- [ ] **Step 6: Run it on the probe build**

Run: `node scripts/qc-training-video.mjs --video _probe`
Expected: sheets, one beat frame per beat, one zoom frame, and either `no unexplained freezes` or a listed freeze. LOOK at every image. A freeze is expected at the end of the probe section if the take padded to `targetSeconds` past the narration; confirm by the timestamp and report it.

- [ ] **Step 7: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/qc.mjs scripts/lib/qc.test.mjs scripts/qc-training-video.mjs
git add scripts/lib/qc.mjs scripts/lib/qc.test.mjs scripts/qc-training-video.mjs
git commit -m "feat(training): QC contact sheets, beat and zoom frames, freeze detection"
```

---

### Task 11: Video 1 script draft (CHECKPOINT: Chris approves before Task 12)

**Files:**
- Create: `docs/training-videos/scripts/getting-started.md`

**Interfaces:**
- Produces: the section ids Task 12's walkthrough must use, in order: `welcome`, `productions-list`, `create-production`, `workspace-tour`, `wrap-up`.

- [ ] **Step 1: Verify every UI claim against the code before writing it**

Open and read, at minimum: `src/app/(app)/productions/page.tsx`, `src/app/(app)/productions/new/page.tsx`, `src/components/NewProductionForm.tsx`, `src/app/(app)/productions/[id]/page.tsx`, `src/components/ProductionWorkspace.tsx`, `src/components/RoleCard.tsx`, `src/components/PastAndInactiveProductions.tsx`, `src/components/CountdownBadge.tsx`, `src/components/AppNav.tsx`, and the `#productions` section of `src/app/(app)/guide/page.tsx`. Every button name, field label, and tab name in the script must be the exact on-screen text. Do not describe any feature that the seeded demo data will not show on camera.

- [ ] **Step 2: Write the script**

Format rules (the generator depends on them): one `## <Heading> (`<id>`)` header per section, paragraphs separated by blank lines, director notes on lines starting with `>`. Every sentence 5 words or longer (short lines read clipped). Quote UI names exactly. No em-dashes: use commas and periods. Keep each section 20 to 60 seconds of speech (about 50 to 150 words); the whole video 2 to 4 minutes.

Starting draft (rewrite freely where the code says otherwise):

```markdown
# Getting Started, VO script

Voice: Ava (en-US-AvaMultilingualNeural). Recorded against the Demo Theatre Co. org.

## Welcome (`welcome`)

Welcome to Measure My Costume, the costume planner built for theatre costume teams. In this video, we'll find your way around, create a production, and take a quick tour of its workspace.

## Your productions (`productions-list`)

Everything starts on the Productions page. Each show you're costuming gets its own card here, with a countdown to its next showing.

> point: the Midsummer card, then its countdown badge

Shows that have closed move down into past and inactive productions, so they stay out of your way but never disappear.

## Create a production (`create-production`)

To start a new show, choose "New Production" and give it a title. We'll call this one Twelfth Night.

Next, add your showings. Each showing gets a date, an optional time, and an optional label, like Opening Night or Matinee.

> zoom: the showing label field

When everything looks right, create the production, and you land right in its workspace.

## The production workspace (`workspace-tour`)

Here's the workspace for A Midsummer Night's Dream. Every role in the show has its own card, with the performer cast in it.

> zoom: the Titania card

Open a role to plan its costume, record measurements, and keep notes, all in one place.

## Wrap up (`wrap-up`)

That's the basics of getting around. In the next video, we'll add roles and cast your performers.
```

- [ ] **Step 3: Render the narration and list sentences**

```bash
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video getting-started
node scripts/list-vo-sentences.mjs --video getting-started
```

Expected: every section renders; the total narration is printed.

- [ ] **Step 4: Em-dash sweep, commit, and STOP for approval**

```bash
grep -rn $'\u2014' docs/training-videos/scripts/getting-started.md
git add docs/training-videos/scripts/getting-started.md
git commit -m "docs(training): Getting Started narration script draft"
```

Report to the controller: the script text, the total narration seconds, and the path to each section's wav. The controller shows the script to Chris and plays him one section of the Ava audio. Task 12 does not start until Chris approves the script. If he edits it, re-run Step 3 (the cache re-renders only changed paragraphs).

---

### Task 12: Video 1 walkthrough, record, build, QC (CHECKPOINT: Chris approves the MP4)

**Files:**
- Create: `scripts/lib/walkthroughs/getting-started.mjs`
- Modify: `docs/training-videos/README.md` (append the Clerk ticket sign-in recipe for manual checks, and "Video status")

**Interfaces:**
- Consumes: everything above; approved script from Task 11; `list-vo-sentences.mjs` output for `s:` values.

- [ ] **Step 1: Write the walkthrough**

Use `list-vo-sentences.mjs` output for every `s:`. Every `h.point`, `h.zoom`, `h.navigateSlowly`, and `h.openRecord` carries `s:`. Navigation is shown on camera (no `gotoAuthed` after a section's first line). Call `h.zoom` only on a settled screen, and hold still through `holdMs`. Structure (selectors must be confirmed against the live page with `playwright-cli` before recording; prefer `getByRole` with exact names):

```js
// Training video 1: "Getting Started". Script: docs/training-videos/scripts/getting-started.md.
//
// DB state: runs against the seeded demo org (node scripts/seed-demo-org.mjs).
// "create-production" CREATES "Twelfth Night"; its prep deletes any existing
// Twelfth Night first, so the section retakes standalone. No other section
// writes.
const TWELFTH = "Twelfth Night";

async function deleteByTitle(api, title) {
  const { productions } = await api.get("/api/productions");
  for (const p of productions.filter((x) => x.title === title)) await api.del(`/api/productions/${p.id}`);
}

export const WALKTHROUGH = {
  slug: "getting-started",
  title: "Getting Started",
  guideAnchor: "productions",
  sections: [
    {
      id: "welcome",
      heading: "Welcome",
      targetSeconds: 14,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 2500);
      },
    },
    {
      id: "productions-list",
      heading: "Your productions",
      targetSeconds: 22,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 800);
        await h.point(page, page.getByRole("link", { name: /A Midsummer Night's Dream/ }), { s: 0 });
        await h.hold(page, 1500);
        // s values below are placeholders for the shape only; replace every
        // one with the list-vo-sentences.mjs index before recording.
        await h.zoom(page, page.getByText(/days? to/i).first(), { s: 1, holdMs: 2600 });
        await h.point(page, page.getByText(/past|inactive/i).first(), { s: 2 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "create-production",
      heading: "Create a production",
      targetSeconds: 40,
      prep: (api) => deleteByTitle(api, TWELFTH),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        const newBtn = page.getByRole("link", { name: "New Production" });
        await h.point(page, newBtn, { s: 0 });
        await h.hold(page, 900);
        await newBtn.click();
        await page.getByPlaceholder("Mary Poppins").waitFor();
        await h.hold(page, 900);
        await h.type(page, 'input[placeholder="Mary Poppins"]', TWELFTH);
        await h.point(page, page.getByLabel("Showing date"), { s: 1 });
        // Fill date and time via the real inputs, then:
        await h.zoom(page, page.getByLabel("Showing label (optional)"), { s: 2, holdMs: 2600 });
        // Type "Opening Night", point at the create button (s: 3), click it,
        // wait for the workspace heading, hold 1500.
      },
    },
    {
      id: "workspace-tour",
      heading: "The production workspace",
      targetSeconds: 30,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.openRecord(page, "A Midsummer Night's Dream", "/productions/", { s: 0 });
        await h.zoom(page, page.getByText("Titania").first(), { s: 1, holdMs: 2600 });
        // Open the Titania role card and hold on its tabs (s: 2).
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 10,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 2000);
      },
    },
  ],
};
```

Complete every commented step with real calls before recording. Replace every `s:` with values from `list-vo-sentences.mjs`. The `openRecord` fallback path must be the real production URL; look it up with the demo API in a quick script, or pass a `headingRe` and let the row click navigate.

- [ ] **Step 2: Static checks**

Run: `node scripts/check-beat-annotations.mjs --video getting-started; echo EXIT=$?`
Expected: `0 unannotated, 0 structural problem(s)`, `EXIT=0`.

- [ ] **Step 3: Seed, record, build, QC**

```bash
npm run build && npm start   # separate terminal; must be a fresh build of this branch
node scripts/seed-demo-org.mjs
node scripts/record-training-video.mjs --video getting-started
node scripts/build-training-video.mjs --video getting-started
node scripts/qc-training-video.mjs --video getting-started
```

Expected: no FAILED sections, the builder prints every section with `s:` equal to its beat count, and QC reports no unexplained freezes.

- [ ] **Step 4: Look at every QC image and fix what they show**

For each beat frame, check that the screen shows what its sentence names. For each zoom frame, check it is sharp and centered on the named control. For each contact sheet, check there are no blank or loading frames, no sign-in flash, and no stray cursor at (0,0). A failed `point()` warning in the recorder log counts as a defect in the seed or the selector until a frame proves otherwise. Retake only the affected section with `--section <id>`, then rebuild and re-run QC. Count every defect found, not just the first.

- [ ] **Step 5: Update the README and commit**

Append to `docs/training-videos/README.md`:
- the manual sign-in recipe (mint a ticket for `demo-org.json`'s `clerkUserId` with the dev `CLERK_SECRET_KEY`, response written to a mode-600 scratchpad file, visit `/sign-in?__clerk_ticket=<token>`);
- a "Video status" table: `getting-started | built <date> | awaiting Chris`.

```bash
grep -rn $'\u2014' scripts/lib/walkthroughs/getting-started.mjs docs/training-videos/README.md
git add scripts/lib/walkthroughs/getting-started.mjs docs/training-videos/README.md
git commit -m "feat(training): Getting Started walkthrough recorded and built"
```

- [ ] **Step 6: STOP for Chris's review**

Report to the controller: MP4 and VTT paths, duration, defects found and fixed (with counts), and any remaining judgment calls (zoom scale, pacing, cursor color). The controller hands Chris the MP4. Iterate on his notes. When he approves, the next steps are separate plans: scripts and walkthroughs for videos 2 to 6, then hosting (Supabase Storage bucket migration, upload script, `<TrainingVideo>` embed in `/guide`).
