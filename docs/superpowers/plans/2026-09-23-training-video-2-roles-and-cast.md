# Training Video 2 (Roles and Cast) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the beat-mark lag in the recorder (followups.md item 1), then script, record, build, and QC video 2, "Roles and Cast".

**Architecture:** The lag fix moves the clip clock origin in `record()` to just before `ctx.newPage()`, marks `point()` beats after a painted frame, and adds one calibrated constant `FRAME_LAG_S` at the single place markers are rebased. That rebase is extracted into a pure, tested `lib/markers.mjs`. The constant is measured, not guessed: a `lag` section in the `_probe` walkthrough teleports the cursor between two targets, and a new `measure-frame-lag.mjs` finds the first webm frame where the amber dot sits on each target. Video 2 then follows the video 1 recipe: script (Chris approves), Ava VO, walkthrough with per-section API preps built on a shared `lib/demo-productions.mjs`, record, build, QC (Chris approves).

**Tech Stack:** Node ESM scripts, Playwright 1.63, ffmpeg/ffprobe (Homebrew, no `drawtext`), edge-tts in `~/.venvs/edge-tts`, Vitest (`scripts/**/*.test.mjs`), the app's own API routes as the demo user.

**Spec:** `docs/superpowers/specs/2026-09-22-training-videos-design.md` (video list item 2). Also read `docs/training-videos/followups.md` (item 1 is Tasks 1 and 2 here), `docs/training-videos/README.md`, and `~/.claude/skills/recording-app-training-videos/lessons.md` before any walkthrough work.

## Global Constraints

- Voice: `en-US-AvaMultilingualNeural`, rate `+0%`, pitch `+0Hz`.
- Output: 1920x1080, 30 fps, H.264 + AAC MP4, plus a WebVTT file beside it.
- Record and seed only against a production build YOU started: `npm run build`, then `PORT=3000 npm start` with `DEMO_BASE_URL=http://localhost:3000` on every seeder/recorder/measure command. Port 6100 is held by a next-server that is not ours (pid 99006 at last check): never touch it, never kill anything by name. Stop your own server by port when done (`kill $(lsof -ti :3000)`), after confirming with `lsof -i :3000` that the listener is the one you started.
- Record only as the demo user in the demo org (`scripts/lib/demo-org.json`). Dev and prod share ONE Supabase database. Nothing touches any org except the demo org, and nothing touches any production in it except the ones named in this plan.
- Blocking rules for every implementer: **no `any`** (lint errors on it), **NO EM-DASHES anywhere** (code, comments, docs, narration, commit messages), and **grep every file you wrote (not the diff) before committing**: `grep -rn $'\u2014' <files>` must print nothing.
- Beat sentence indices (`s:`) come from `node scripts/list-vo-sentences.mjs --video roles-and-cast` output, never counted by hand. After any script edit, regenerate VO first, then re-derive every `s:`.
- Clerk popovers (UserButton, OrgSwitcher) never open on camera (they misplace under `html{zoom:1.5}`).
- Every UI string in the script and every selector is the exact on-screen text, confirmed in code and on the live page (`playwright-cli`), not taken from this plan. This plan quotes strings verified on 2026-09-23; re-check them.
- Branch `feat/training-video-2`, local commits only. Nothing is pushed or deployed without Chris's explicit go-ahead.
- Logs and probe frames go in YOUR session scratchpad directory, written `<scratch>` below. Never in the repo, never `/tmp`.
- Commit trailer goes in the body, on its own line after a blank line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Verified facts this plan builds on (2026-09-23)

- Roles form (`src/components/ProductionWorkspace.tsx:510-528`): input placeholder `Add a role (character)`, checkbox label `Ensemble`, submit button `Add role`. One role per submit.
- Empty-state banner (`src/components/RoleSuggestionBanner.tsx`) renders only while the production has zero roles. A title in `src/lib/data/play-catalog.ts` (Hamlet, Midsummer, Macbeth, and others) shows `This looks like <title>. Add its N standard roles?` with no AI call. Any other title, when `ANTHROPIC_API_KEY` is set, shows `Know this play's cast? Let AI suggest the standard roles.` and a `Suggest roles with AI` button (label `Thinking…` while loading), then the names list and `Add all roles` (label `Adding…` while adding). Twelfth Night is NOT in the catalog, so it takes the AI path. `.env.local` has `ANTHROPIC_API_KEY`.
- Casting (`src/components/RoleCastPanel.tsx`, `src/components/PerformerPicker.tsx`): role card tab `Cast & Measure`. Non-ensemble roles: `+ Add primary`, `Understudies`, `+ Add understudy`. Ensemble roles: `+ Add performer`. The picker input's aria-label equals its placeholder (`Add primary`, `Add understudy`, `Add performer`). Typing lists existing performers of the production (name plus a role summary) and a `+ Add new "<typed>"` button (curly quotes in the rendered text).
- Collapsed ensemble row reads `Ensemble · <count>` (`RoleCard.tsx:75-76`).
- Duplicate notice (`ProductionWorkspace.tsx:358-374`): `1 name appears more than once.` (JSX line break between "than" and "once", so match with `/1 name appears more than\s+once/`), and a `Combine duplicates` button. The panel (`CombineDuplicatesPanel.tsx`) marks the survivor `Kept`, labels each member `measured` / `partly measured` / `not measured`, and submits with `Combine selected (<n>)` (label `Combining…` while busy).
- API: `POST /api/productions` `{ title, notes?, showings }` returns `{ production }`. `POST /api/productions/<id>/roles` takes `{ names }` (returns `{ roles }`) or `{ name, isEnsemble }` (returns `{ role }`). `GET /api/productions/<id>/casts` returns `{ casts }`, the first is the default cast. `POST /api/productions/<id>/castings` takes `{ castId, roleId, name | performerId, assignment? }` where assignment is `primary | understudy | ensemble` (defaults from the role), and returns `{ performer, casting }`. Every `name` casting creates a NEW performer row (`src/lib/data/castings.ts:59`), which is how a prep creates a duplicate. `DELETE /api/productions/<id>` removes a production.

---

### Task 1: Beat-lag fix in the recorder and builder (pure parts TDD, constant still 0)

**Files:**
- Create: `scripts/lib/markers.mjs`
- Test: `scripts/lib/markers.test.mjs`
- Modify: `scripts/lib/zoom.mjs` (add `zoomRawWindow`)
- Modify: `scripts/lib/zoom.test.mjs`
- Modify: `scripts/lib/record-core.mjs` (`record`, `point`, `zoom`, `gotoAuthed`)
- Modify: `scripts/build-training-video.mjs:95-99` (zoom window)

**Interfaces:**
- Produces: `FRAME_LAG_S` (number, seconds, `0` in this task), `rebaseMarkers(markers, clipT0, lagS = FRAME_LAG_S)` returning the `beats` array written to `markers.json`, where each beat is `{ beat, t, ok, s, pos?, zoom? }`, `pos` is `{ x, y }` in viewport px (the cursor's final position, also the recorded-video px since viewport and video are both 1920x1080), and `zoom` is `{ box, scale, holdS, still, stillT }` with `stillT` in clip seconds.
- Produces: `zoomRawWindow(beat)` returning `{ r0, r1 }` raw-clip seconds for a zoom beat.
- Produces: `point(page, target, { timeoutMs, s, mark, steps = 12 })` (new `steps` option).

- [ ] **Step 1: Branch**

```bash
git -C /Users/jarvis/projects/customers/nada-costume fetch
git -C /Users/jarvis/projects/customers/nada-costume status -sb
git -C /Users/jarvis/projects/customers/nada-costume switch -c feat/training-video-2 main
```

Expected: status is clean on `main` (ahead of origin by 20 or more, which is fine: local main carries the unpushed training pipeline).

- [ ] **Step 2: Write the failing tests for `markers.mjs`**

`scripts/lib/markers.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { FRAME_LAG_S, rebaseMarkers } from "./markers.mjs";

describe("rebaseMarkers", () => {
  it("rebases wall-clock ms to clip seconds and adds the lag", () => {
    const out = rebaseMarkers([{ beat: 0, at: 11500, ok: true, s: 2 }], 10000, 0.2);
    expect(out).toEqual([{ beat: 0, t: 1.7, ok: true, s: 2 }]);
  });

  it("defaults the lag to FRAME_LAG_S", () => {
    const [b] = rebaseMarkers([{ beat: 0, at: 12000, ok: true, s: null }], 10000);
    expect(b.t).toBe(+(2 + FRAME_LAG_S).toFixed(3));
  });

  it("keeps pos when present and omits it when absent", () => {
    const out = rebaseMarkers([
      { beat: 0, at: 10000, ok: true, s: 0, pos: { x: 10, y: 20 } },
      { beat: 1, at: 10000, ok: false, s: 1 },
    ], 10000, 0);
    expect(out[0].pos).toEqual({ x: 10, y: 20 });
    expect("pos" in out[1]).toBe(false);
  });

  it("rebases a zoom's stillAt to stillT with the same lag and drops stillAt", () => {
    const zoom = { box: { x: 1, y: 2, width: 3, height: 4 }, scale: 1.6, holdS: 2.6, still: "zoom-00.jpg", stillAt: 13000 };
    const [b] = rebaseMarkers([{ beat: 0, at: 12000, ok: true, s: 0, zoom }], 10000, 0.1);
    expect(b.t).toBe(2.1);
    expect(b.zoom).toEqual({ box: zoom.box, scale: 1.6, holdS: 2.6, still: "zoom-00.jpg", stillT: 3.1 });
  });

  it("rounds to milliseconds", () => {
    const [b] = rebaseMarkers([{ beat: 0, at: 10001.4, ok: true, s: 0 }], 10000, 0);
    expect(b.t).toBe(0.001);
  });
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `npx vitest run scripts/lib/markers.test.mjs`
Expected: FAIL, cannot resolve `./markers.mjs`.

- [ ] **Step 4: Implement `markers.mjs`**

```js
// The one place recorder beat markers are rebased from wall-clock ms onto
// the raw clip's own timeline. record-core.mjs takes clipT0 immediately
// before ctx.newPage() (Playwright's recordVideo timeline starts inside
// that call), and point() marks only after a painted frame. What remains
// is the capture pipeline's own latency: the frame that shows an event
// lands a roughly constant time after the JS clock saw it. FRAME_LAG_S is
// that latency, MEASURED with scripts/measure-frame-lag.mjs against the
// _probe "lag" section (see docs/training-videos/README.md), never guessed.
// Adding it here, and only here, shifts every beat and every zoom still
// window by the same amount, so point beats and zoom beats stay consistent.
export const FRAME_LAG_S = 0;

export function rebaseMarkers(markers, clipT0, lagS = FRAME_LAG_S) {
  const t = (ms) => +((ms - clipT0) / 1000 + lagS).toFixed(3);
  return markers.map((m) => {
    const out = { beat: m.beat, t: t(m.at), ok: m.ok, s: m.s };
    if (m.pos) out.pos = m.pos;
    if (m.zoom) {
      const { stillAt, ...rest } = m.zoom;
      out.zoom = { ...rest, stillT: t(stillAt) };
    }
    return out;
  });
}
```

- [ ] **Step 5: Run it, expect pass**

Run: `npx vitest run scripts/lib/markers.test.mjs`
Expected: 5 passed.

- [ ] **Step 6: Failing test for `zoomRawWindow`**

Append to `scripts/lib/zoom.test.mjs` (add `zoomRawWindow` to its existing import from `./zoom.mjs`):

```js
describe("zoomRawWindow", () => {
  it("starts at the still when stillT is recorded and runs holdS", () => {
    expect(zoomRawWindow({ t: 5, zoom: { holdS: 2.6, stillT: 5.9 } })).toEqual({ r0: 5.9, r1: 5.9 + 2.6 });
  });
  it("falls back to the legacy marker-relative window for older takes", () => {
    expect(zoomRawWindow({ t: 5, zoom: { holdS: 2.6 } })).toEqual({ r0: 5 + 0.15, r1: 5 + 2.6 - 0.1 });
  });
});
```

Run: `npx vitest run scripts/lib/zoom.test.mjs`
Expected: FAIL, `zoomRawWindow` is not exported.

- [ ] **Step 7: Implement `zoomRawWindow`**

Append to `scripts/lib/zoom.mjs`:

```js
/** Raw-clip window of a zoom beat's still hold. The zoom marker's own `t`
 * is taken BEFORE the cursor glides to the target (so the beat aligns to
 * the glide's start), but the page only holds still from the moment the
 * still was captured, `stillT`, for `holdS` after it. Starting the overlay
 * at `t + 0.15` made the live cursor jump to its parked position in the
 * still at the overlay's first frame (followups M12). Takes recorded before
 * stillT existed keep their old window, so video 1's raws still build. */
export function zoomRawWindow(b) {
  if (Number.isFinite(b.zoom.stillT)) return { r0: b.zoom.stillT, r1: b.zoom.stillT + b.zoom.holdS };
  return { r0: b.t + 0.15, r1: b.t + b.zoom.holdS - 0.1 };
}
```

Run: `npx vitest run scripts/lib/zoom.test.mjs`
Expected: all pass.

- [ ] **Step 8: Use it in the builder**

In `scripts/build-training-video.mjs`, add `zoomRawWindow` to the `./lib/zoom.mjs` import and replace:

```js
    const o0 = rawToOut(r.segs, b.t + 0.15);
    const o1 = rawToOut(r.segs, b.t + b.zoom.holdS - 0.1);
```

with:

```js
    const { r0, r1 } = zoomRawWindow(b);
    const o0 = rawToOut(r.segs, r0);
    const o1 = rawToOut(r.segs, r1);
```

- [ ] **Step 9: Recorder changes in `scripts/lib/record-core.mjs`**

1. Imports: add `import { rebaseMarkers } from "./markers.mjs";` and add `assertDemoSession` from `./demo-org.mjs` (check its current export list first).
2. Add, above `createRecorder`:

```js
/** Resolves after the browser has painted at least one frame since the
 * call: the first rAF runs before the next paint, the second only after it.
 * Marking a beat after this ties the mark to a painted frame instead of to
 * the input dispatch. Best-effort: a navigation mid-evaluate rejects, and a
 * lost wait must never cost a take. */
async function afterPaint(page) {
  await page
    .evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    .catch(() => {});
}
```

3. In `record()`: move `const clipT0 = Date.now();` to the line immediately BEFORE `const page = await ctx.newPage();`, and change the comment above it to: `// context.recordVideo's timeline starts inside newPage(), so the clock origin is taken just before it. The capture latency that remains is FRAME_LAG_S (markers.mjs).` Replace the whole `beats: markers.map(...)` expression in the `writeFileSync` with `beats: rebaseMarkers(markers, clipT0),`.
4. In `point()`: add `steps = 12` to its options, declare `let pos = null;` next to `let ok = true;`, and replace the move with:

```js
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps });
      pos = { x: Math.round(x), y: Math.round(y) };
```

   and replace the final `if (mark) markers.push(...)` with:

```js
    if (mark) {
      await afterPaint(page);
      markers.push({ beat, at: Date.now(), ok, s, ...(pos ? { pos } : {}) });
    }
```

   Update the comment "Glide rather than teleport" to add: `steps: 1 teleports, which only the frame-lag calibration uses.`
5. In `zoom()`: after `await page.waitForTimeout(250); // cursor glide settles`, add `await afterPaint(page);` and `const stillAt = Date.now();`, and put `stillAt` into `info`: `info = { box, scale, holdS: holdMs / 1000, still, stillAt };`. Leave `const at = Date.now();` where it is (the beat still aligns to the glide's start).
6. In `gotoAuthed()`, after `await assertSignedIn(page, path, opts);` (followups M2, on-camera writes guarded directly):

```js
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 15000 });
    const session = await page.evaluate(() => ({
      userId: window.Clerk.user?.id ?? null,
      orgId: window.Clerk.organization?.id ?? null,
    }));
    assertDemoSession(session, demo);
```

- [ ] **Step 10: Full checks**

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
node scripts/build-training-video.mjs --video getting-started > <scratch>/build-gs.log 2>&1; echo EXIT=$?; tail -12 <scratch>/build-gs.log
```

Expected: all tests pass (1290 before this task plus 7 new), eslint clean, and video 1 still builds from its existing raws at `2:14` or `2:15` (its markers have no `stillT`, so the legacy window applies and nothing about video 1 changes). Never pipe the builder through `head` (lessons F5); use the log file.

- [ ] **Step 11: Em-dash sweep and commit**

```bash
grep -rn $'\u2014' scripts/lib/markers.mjs scripts/lib/markers.test.mjs scripts/lib/zoom.mjs scripts/lib/zoom.test.mjs scripts/lib/record-core.mjs scripts/build-training-video.mjs
git add scripts/lib/markers.mjs scripts/lib/markers.test.mjs scripts/lib/zoom.mjs scripts/lib/zoom.test.mjs scripts/lib/record-core.mjs scripts/build-training-video.mjs
git commit -m "fix(training): mark beats on painted frames from a pre-newPage clock origin" -m "Rebase moves to pure lib/markers.mjs with a FRAME_LAG_S hook (0 until calibrated). Zoom overlays start at the captured still (M12). gotoAuthed asserts the demo session (M2)." -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Calibrate `FRAME_LAG_S` and prove it on `_probe`

**Files:**
- Create: `scripts/lib/frame-lag.mjs`
- Test: `scripts/lib/frame-lag.test.mjs`
- Create: `scripts/measure-frame-lag.mjs`
- Modify: `scripts/lib/walkthroughs/_probe.mjs` (add section `lag`)
- Modify: `scripts/lib/markers.mjs` (the measured `FRAME_LAG_S`)
- Modify: `docs/training-videos/followups.md` (mark item 1, M2, M12 done)

**Interfaces:**
- Consumes: `markers.json` beats with `pos` and `t` (Task 1), `rawDir`, `sectionClipPath` from `lib/training.mjs`.
- Produces: `parseSignalStats(text, key)`, `arrivalTime(series, markT, opts)`, `lagConstant(lags)`; CLI `node scripts/measure-frame-lag.mjs --video <slug> --section <id>`.

- [ ] **Step 1: Failing tests for the pure part**

`scripts/lib/frame-lag.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { parseSignalStats, arrivalTime, lagConstant } from "./frame-lag.mjs";

const LOG = [
  "frame:0    pts:0       pts_time:0",
  "lavfi.signalstats.VAVG=128.2",
  "frame:1    pts:40      pts_time:0.04",
  "lavfi.signalstats.VAVG=128.4",
  "frame:2    pts:80      pts_time:0.08",
  "lavfi.signalstats.VAVG=151.0",
].join("\n");

describe("parseSignalStats", () => {
  it("pairs each frame's pts_time with the requested key", () => {
    expect(parseSignalStats(LOG, "lavfi.signalstats.VAVG")).toEqual([
      { t: 0, v: 128.2 }, { t: 0.04, v: 128.4 }, { t: 0.08, v: 151 },
    ]);
  });
  it("ignores other keys", () => {
    expect(parseSignalStats(LOG, "lavfi.signalstats.UAVG")).toEqual([]);
  });
});

const series = (vals, step = 0.04) => vals.map((v, i) => ({ t: +(i * step).toFixed(2), v }));

describe("arrivalTime", () => {
  // 2 s of baseline at 128, the dot arrives at t = 2.2.
  const s = series([...Array(55).fill(128), ...Array(20).fill(150)]);
  it("finds the first frame that departs from the pre-mark baseline", () => {
    expect(arrivalTime(s, 2.0)).toBeCloseTo(2.2, 5);
  });
  it("returns null when nothing departs", () => {
    expect(arrivalTime(series(Array(80).fill(128)), 2.0)).toBeNull();
  });
  it("returns null when the baseline window has no frames", () => {
    expect(arrivalTime(s, 0.3)).toBeNull();
  });
});

describe("lagConstant", () => {
  it("is the worst observed lag plus one 25 fps frame, rounded up to 10 ms", () => {
    expect(lagConstant([0.12, 0.2, 0.161])).toBe(0.24);
  });
  it("never goes negative", () => {
    expect(lagConstant([-0.3, -0.1])).toBe(0);
  });
  it("refuses an empty sample", () => {
    expect(() => lagConstant([])).toThrow(/no lag samples/);
  });
});
```

Run: `npx vitest run scripts/lib/frame-lag.test.mjs`
Expected: FAIL, cannot resolve `./frame-lag.mjs`.

- [ ] **Step 2: Implement `frame-lag.mjs`**

```js
// Pure helpers for measuring how far a recorded frame trails the recorder's
// beat mark. measure-frame-lag.mjs crops a small box at each beat's cursor
// position out of the raw webm, reads a chroma average per frame with
// ffmpeg signalstats, and asks when the amber dot first shows up there.

/** `ffmpeg ... signalstats,metadata=print:key=<key>:file=-` stdout to
 * [{ t, v }]. metadata=print logs at info level, so without :file=- the
 * output goes to the log and `-v error` swallows it. */
export function parseSignalStats(text, key) {
  const out = [];
  let t = null;
  for (const line of text.split("\n")) {
    const frame = line.match(/pts_time:(-?[\d.]+)/);
    if (frame) {
      t = Number(frame[1]);
      continue;
    }
    const kv = line.match(/^([\w.]+)=(-?[\d.]+)/);
    if (kv && kv[1] === key && t !== null) out.push({ t, v: Number(kv[2]) });
  }
  return out;
}

const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

/** First frame at or after markT - searchBackS whose value departs from the
 * baseline (median over [markT - baselineFromS, markT - baselineToS], when
 * the cursor is known to be elsewhere) by more than `threshold`. */
export function arrivalTime(series, markT, { baselineFromS = 1.2, baselineToS = 0.7, searchBackS = 0.6, threshold = 6 } = {}) {
  const base = series.filter((p) => p.t >= markT - baselineFromS && p.t <= markT - baselineToS);
  if (base.length === 0) return null;
  const b = median(base.map((p) => p.v));
  const hit = series.find((p) => p.t >= markT - searchBackS && Math.abs(p.v - b) > threshold);
  return hit ? hit.t : null;
}

/** The constant to add at the rebase: the WORST observed lag (so the frame
 * at every mark already shows the settled cursor), plus one 25 fps frame of
 * margin, rounded up to 10 ms. A mark a frame late costs nothing on camera;
 * a mark a frame early freezes a gliding cursor. */
export function lagConstant(lags) {
  if (lags.length === 0) throw new Error("no lag samples");
  const worst = Math.max(...lags);
  return Math.max(0, Math.ceil((worst + 0.04) * 100 - 1e-9) / 100);
}
```

Run: `npx vitest run scripts/lib/frame-lag.test.mjs`
Expected: 8 passed.

- [ ] **Step 3: The `lag` calibration section**

Add a second section to `scripts/lib/walkthroughs/_probe.mjs` `sections` (keep the existing `probe` section unchanged):

```js
    {
      // Frame-lag calibration (followups.md item 1). Teleports the cursor
      // (steps: 1) between two still targets, holding 1.5 s on each, so each
      // mark has a clean pre-move baseline at the NEXT target for
      // measure-frame-lag.mjs. Never built into a video.
      id: "lag",
      heading: "Lag",
      targetSeconds: 20,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 1500);
        const a = page.locator("main h1").first();
        const b = page.locator("main").getByRole("link", { name: "+ New Production" });
        for (let i = 0; i < 5; i++) {
          await h.point(page, a, { steps: 1 });
          await h.hold(page, 1500);
          await h.point(page, b, { steps: 1 });
          await h.hold(page, 1500);
        }
      },
    },
```

Before recording, confirm with `playwright-cli` (or one throwaway take) that `main h1` and `+ New Production` are both on screen at load on `/productions` without scrolling; if not, pick two other on-screen, non-overlapping elements and say which in the report.

- [ ] **Step 4: The measuring CLI**

`scripts/measure-frame-lag.mjs`:

```js
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
```

- [ ] **Step 5: Record three calibration takes and measure**

```bash
npm run build > <scratch>/next-build.log 2>&1; echo BUILD_EXIT=$?
```

Start the server in the background (`PORT=3000 npm start`, Bash tool `run_in_background: true`), check `lsof -i :3000` shows it, then three times, saving each report:

```bash
DEMO_BASE_URL=http://localhost:3000 node scripts/record-training-video.mjs --video _probe --section lag
node scripts/measure-frame-lag.mjs --video _probe --section lag > <scratch>/lag-run1.txt 2>&1; cat <scratch>/lag-run1.txt
```

(`lag-run2.txt`, `lag-run3.txt` for the next two; each record replaces the previous take, so measure before re-recording.)

Expected: 10 samples per run, no `NO ARRIVAL FOUND`. If any run reports no arrival, pull the frame at that beat's `t + 0.5` (`ffmpeg -v error -i <webm> -ss <t> -frames:v 1 f.png`) and look at it before touching thresholds. If the spread across all 30 samples (max minus min) exceeds 0.12 s (three 25 fps frames), STOP and report: a non-constant lag cannot be fixed by one constant, and the controller decides.

- [ ] **Step 6: Set the constant**

Compute `lagConstant` over ALL 30 samples (the worst across the three runs, not the last run's line). Set `export const FRAME_LAG_S = <value>;` in `scripts/lib/markers.mjs`, and add one comment line above it: `// Measured 2026-09-23: <n> samples over 3 takes, lag <min> to <max> s.`

Run: `npx vitest run scripts/lib/markers.test.mjs`
Expected: pass (the default-lag test reads the constant).

- [ ] **Step 7: Prove it**

Re-record the `lag` section once more and measure. Expected: every sample's lag is `<= 0` (the frame at every mark already shows the parked cursor), none below `-0.2`.

Then re-record the ordinary `probe` section (12-step glides plus a zoom) and prove the followups item 1 criterion directly:

```bash
DEMO_BASE_URL=http://localhost:3000 node scripts/record-training-video.mjs --video _probe --section probe
node scripts/measure-frame-lag.mjs --video _probe --section probe
```

Expected: the point beat's lag `<= 0`. Then extract the frame at each beat's `t` and look at it (the webm path is in `recordings/training/raw/_probe/probe/`):

```bash
ffmpeg -v error -y -i <webm> -ss <t> -frames:v 1 <scratch>/probe-beat0.png
```

Both frames must show the amber dot parked on the Midsummer card, not mid-glide. Also check the zoom beat in `markers.json` carries `zoom.stillT` greater than its `t`. Stop the server by port.

- [ ] **Step 8: Checks, docs, commit**

In `docs/training-videos/followups.md`: under item 1, add a first line `Done 2026-09-23 on feat/training-video-2: FRAME_LAG_S = <value> s, measured with scripts/measure-frame-lag.mjs (see README). The double-point workaround in getting-started.mjs stays until video 1 is next re-recorded.`, and prefix M2 and M12 with `Done 2026-09-23.`

In `docs/training-videos/README.md`, add a section:

```markdown
## Frame-lag calibration

Beat marks are rebased with `FRAME_LAG_S` (`scripts/lib/markers.mjs`), the
measured delay between a painted cursor move and the recorded frame that
shows it. Re-measure after a Playwright upgrade or on a different machine:
record `--video _probe --section lag` three times, run
`node scripts/measure-frame-lag.mjs --video _probe --section lag` after each,
and add `lagConstant` over all samples to the current value. A correct
constant makes every measured lag `<= 0`.
```

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
grep -rn $'\u2014' scripts/lib/frame-lag.mjs scripts/lib/frame-lag.test.mjs scripts/measure-frame-lag.mjs scripts/lib/walkthroughs/_probe.mjs scripts/lib/markers.mjs docs/training-videos/followups.md docs/training-videos/README.md
git add scripts/lib/frame-lag.mjs scripts/lib/frame-lag.test.mjs scripts/measure-frame-lag.mjs scripts/lib/walkthroughs/_probe.mjs scripts/lib/markers.mjs docs/training-videos/followups.md docs/training-videos/README.md
git commit -m "feat(training): measure and apply the recorder frame lag" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Report: the three runs' min/max, the constant, the proof-run lags, and the two frame paths.

---

### Task 3: Shared demo-production helpers

**Files:**
- Create: `scripts/lib/demo-productions.mjs`
- Test: `scripts/lib/demo-productions.test.mjs`
- Modify: `scripts/lib/walkthroughs/getting-started.mjs` (import the helpers, delete its local copies; followups M14)

**Interfaces:**
- Consumes: `showDate(offsetDays)` from `./demo-fixtures.mjs`; an `api` with `get/post/del` as made by `createDemoApi` (`lib/demo-api.mjs`).
- Produces:
  - `TWELFTH = "Twelfth Night"`, `TWELFTH_SHOWING = { offsetDays: 10, time: "19:30", label: "Opening Night" }`
  - `TWELFTH_ROLES`: `["Viola", "Sebastian", "Orsino", "Olivia", "Malvolio", "Maria", "Sir Toby Belch", "Sir Andrew Aguecheek", "Feste", "Antonio"]`
  - `deleteByTitle(api, title)` returns the number deleted
  - `ensureTwelfthNight(api)` returns the production (existing or created)
  - `resetTwelfthNight(api, { roles = [], ensembleRoles = [], castings = [] })` returns `{ production, roleIds: Map<string,string>, performerIds: Map<string,string> }`. `castings` is `[{ role, name, assignment?, reuse? }]`: `reuse: true` casts the performer already created under that name in this call (by `performerId`), otherwise a new performer is created (which is how a duplicate is made on purpose).

- [ ] **Step 1: Failing tests**

`scripts/lib/demo-productions.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { TWELFTH, TWELFTH_ROLES, deleteByTitle, ensureTwelfthNight, resetTwelfthNight } from "./demo-productions.mjs";
import { showDate } from "./demo-fixtures.mjs";

function fakeApi(productions = []) {
  const calls = [];
  let n = 0;
  const api = {
    calls,
    get: async (p) => {
      calls.push(["GET", p]);
      if (p === "/api/productions") return { productions };
      if (p.endsWith("/casts")) return { casts: [{ id: "cast-main" }] };
      throw new Error(`unexpected GET ${p}`);
    },
    post: async (p, b) => {
      calls.push(["POST", p, b]);
      if (p === "/api/productions") {
        const production = { id: `prod-${++n}`, title: b.title };
        productions.push(production);
        return { production };
      }
      if (p.endsWith("/roles") && b.names) return { roles: b.names.map((name) => ({ id: `role-${name}`, name })) };
      if (p.endsWith("/roles")) return { role: { id: `role-${b.name}`, name: b.name } };
      if (p.endsWith("/castings")) return { performer: { id: b.performerId ?? `perf-${++n}` }, casting: { id: `c-${n}` } };
      throw new Error(`unexpected POST ${p}`);
    },
    del: async (p) => {
      calls.push(["DELETE", p]);
      const id = p.split("/").pop();
      productions.splice(productions.findIndex((x) => x.id === id), 1);
      return null;
    },
  };
  return api;
}

describe("deleteByTitle", () => {
  it("deletes every production with the exact title and nothing else", async () => {
    const api = fakeApi([{ id: "a", title: TWELFTH }, { id: "b", title: "Hamlet" }, { id: "c", title: TWELFTH }]);
    expect(await deleteByTitle(api, TWELFTH)).toBe(2);
    expect(api.calls.filter((c) => c[0] === "DELETE").map((c) => c[1])).toEqual(["/api/productions/a", "/api/productions/c"]);
  });
});

describe("ensureTwelfthNight", () => {
  it("returns the existing production without writing", async () => {
    const api = fakeApi([{ id: "a", title: TWELFTH }]);
    expect((await ensureTwelfthNight(api)).id).toBe("a");
    expect(api.calls.some((c) => c[0] !== "GET")).toBe(false);
  });
  it("creates it with the Opening Night showing 10 days out", async () => {
    const api = fakeApi([]);
    await ensureTwelfthNight(api);
    const post = api.calls.find((c) => c[0] === "POST");
    expect(post[2]).toEqual({ title: TWELFTH, showings: [{ date: showDate(10), time: "19:30", label: "Opening Night" }] });
  });
});

describe("resetTwelfthNight", () => {
  it("replaces any existing copy and creates roles, ensembles, and castings in order", async () => {
    const api = fakeApi([{ id: "old", title: TWELFTH }]);
    const { production, roleIds, performerIds } = await resetTwelfthNight(api, {
      roles: TWELFTH_ROLES,
      ensembleRoles: ["Musicians"],
      castings: [
        { role: "Viola", name: "Maya Brooks" },
        { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
        { role: "Musicians", name: "Jordan Lee" },
      ],
    });
    expect(api.calls[1]).toEqual(["DELETE", "/api/productions/old"]);
    expect(production.id).not.toBe("old");
    expect(roleIds.get("Musicians")).toBe("role-Musicians");
    const castings = api.calls.filter((c) => c[1].endsWith("/castings")).map((c) => c[2]);
    expect(castings[0]).toEqual({ castId: "cast-main", roleId: "role-Viola", name: "Maya Brooks" });
    expect(castings[1]).toEqual({ castId: "cast-main", roleId: "role-Olivia", performerId: performerIds.get("Maya Brooks"), assignment: "understudy" });
    expect(castings[2]).toEqual({ castId: "cast-main", roleId: "role-Musicians", name: "Jordan Lee" });
  });
  it("creates no roles when given none (the AI section's empty state)", async () => {
    const api = fakeApi([]);
    await resetTwelfthNight(api);
    expect(api.calls.some((c) => c[1].endsWith("/roles"))).toBe(false);
  });
  it("rejects a casting for a role it did not create", async () => {
    await expect(resetTwelfthNight(fakeApi([]), { castings: [{ role: "Viola", name: "X" }] })).rejects.toThrow(/unknown role "Viola"/);
  });
  it("rejects reuse of a name not created earlier in the same call", async () => {
    await expect(resetTwelfthNight(fakeApi([]), { roles: ["Viola"], castings: [{ role: "Viola", name: "X", reuse: true }] }))
      .rejects.toThrow(/no performer "X" to reuse/);
  });
});
```

Run: `npx vitest run scripts/lib/demo-productions.test.mjs`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 2: Implement**

`scripts/lib/demo-productions.mjs`:

```js
// Off-camera state helpers shared by walkthrough preps. Every call goes
// through the app's API as the demo user (lib/demo-api.mjs asserts that),
// and touches only productions titled here. "Twelfth Night" is the show
// video 1 creates on camera and video 2 fills with roles and cast.
import { showDate } from "./demo-fixtures.mjs";

export const TWELFTH = "Twelfth Night";
// What getting-started's "create-production" types on camera, so a state a
// viewer never watched get created still matches it.
export const TWELFTH_SHOWING = Object.freeze({ offsetDays: 10, time: "19:30", label: "Opening Night" });
// Deterministic stand-in for the AI suggestions (roles-and-cast "ai-roles"
// films the real call, whose output varies). Later sections start from
// this list so their retakes never depend on a model's answer.
export const TWELFTH_ROLES = Object.freeze([
  "Viola", "Sebastian", "Orsino", "Olivia", "Malvolio", "Maria",
  "Sir Toby Belch", "Sir Andrew Aguecheek", "Feste", "Antonio",
]);

export async function deleteByTitle(api, title) {
  const { productions } = await api.get("/api/productions");
  const doomed = productions.filter((p) => p.title === title);
  for (const p of doomed) await api.del(`/api/productions/${p.id}`);
  return doomed.length;
}

async function createTwelfthNight(api) {
  const { production } = await api.post("/api/productions", {
    title: TWELFTH,
    showings: [{ date: showDate(TWELFTH_SHOWING.offsetDays), time: TWELFTH_SHOWING.time, label: TWELFTH_SHOWING.label }],
  });
  return production;
}

export async function ensureTwelfthNight(api) {
  const { productions } = await api.get("/api/productions");
  return productions.find((p) => p.title === TWELFTH) ?? (await createTwelfthNight(api));
}

export async function resetTwelfthNight(api, { roles = [], ensembleRoles = [], castings = [] } = {}) {
  await deleteByTitle(api, TWELFTH);
  const production = await createTwelfthNight(api);
  const base = `/api/productions/${production.id}`;
  const roleIds = new Map();
  if (roles.length > 0) {
    const { roles: made } = await api.post(`${base}/roles`, { names: [...roles] });
    for (const r of made) roleIds.set(r.name, r.id);
  }
  for (const name of ensembleRoles) {
    const { role } = await api.post(`${base}/roles`, { name, isEnsemble: true });
    roleIds.set(role.name, role.id);
  }
  const performerIds = new Map();
  if (castings.length > 0) {
    const { casts } = await api.get(`${base}/casts`);
    const castId = casts[0].id; // the default "Main Cast"
    for (const c of castings) {
      const roleId = roleIds.get(c.role);
      if (!roleId) throw new Error(`resetTwelfthNight: unknown role "${c.role}"`);
      let who;
      if (c.reuse) {
        const performerId = performerIds.get(c.name);
        if (!performerId) throw new Error(`resetTwelfthNight: no performer "${c.name}" to reuse`);
        who = { performerId };
      } else {
        who = { name: c.name };
      }
      const { performer } = await api.post(`${base}/castings`, {
        castId, roleId, ...who, ...(c.assignment ? { assignment: c.assignment } : {}),
      });
      if (!c.reuse) performerIds.set(c.name, performer.id);
    }
  }
  return { production, roleIds, performerIds };
}
```

Note the tests order `performerIds.set` for a repeated non-reuse name: the later performer wins, which is what a deliberate duplicate wants (the prep never reuses a name it duplicated).

Run: `npx vitest run scripts/lib/demo-productions.test.mjs`
Expected: all pass. Fix the test's `api.calls[1]` index if the implementation's GET/DELETE order differs, but only after checking the order is the one described (GET list, then DELETE, then POST create).

- [ ] **Step 3: Refactor `getting-started.mjs` onto the helpers**

In `scripts/lib/walkthroughs/getting-started.mjs`: delete the local `TWELFTH`, `deleteByTitle`, `twelfthNightShowingDate`, and `ensureTwelfthNight`, and add

```js
import { TWELFTH, TWELFTH_SHOWING, deleteByTitle, ensureTwelfthNight } from "../demo-productions.mjs";
import { showDate } from "../demo-fixtures.mjs";
```

Replace the on-camera `dateInput.fill(twelfthNightShowingDate())` with `dateInput.fill(showDate(TWELFTH_SHOWING.offsetDays))`. `prep: (api) => ensureTwelfthNight(api)` keeps working because its return value is ignored. Keep the comment block above the old helper that explains the 10-day choice, moved to sit above the `dateInput.fill` line. Behavior must not change: this is the same date, title, time, and label.

Run: `node scripts/check-beat-annotations.mjs --video getting-started; echo EXIT=$?`
Expected: `EXIT=0`.

- [ ] **Step 4: Checks and commit**

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
grep -rn $'\u2014' scripts/lib/demo-productions.mjs scripts/lib/demo-productions.test.mjs scripts/lib/walkthroughs/getting-started.mjs
git add scripts/lib/demo-productions.mjs scripts/lib/demo-productions.test.mjs scripts/lib/walkthroughs/getting-started.mjs
git commit -m "refactor(training): shared Twelfth Night prep helpers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Mark M14 `Done 2026-09-23.` in `docs/training-videos/followups.md` in the same commit (add it to the `git add`).

---

### Task 4: Video 2 script draft (CHECKPOINT: Chris approves before Task 5)

**Files:**
- Create: `docs/training-videos/scripts/roles-and-cast.md`

**Interfaces:**
- Produces: section ids, in order: `intro`, `ai-roles`, `add-roles`, `cast-performers`, `ensemble`, `combine-duplicates`, `wrap-up`. Task 5's walkthrough uses exactly these.

- [ ] **Step 1: Verify every UI claim against the code**

Read at minimum: `src/components/ProductionWorkspace.tsx`, `src/components/RoleSuggestionBanner.tsx`, `src/app/api/productions/[id]/suggest-roles/route.ts` and the lib it calls, `src/lib/data/play-catalog.ts` (`findCuratedMatch`), `src/components/RoleCard.tsx`, `src/components/RoleCastPanel.tsx`, `src/components/PerformerPicker.tsx`, `src/lib/performer-picker.ts`, `src/components/CombineDuplicatesPanel.tsx`, `src/lib/performer-duplicates.ts`, and the `#roles` section of `src/app/(app)/guide/page.tsx`. Every button name, label, and tab name in the script is the exact on-screen text. The script must not claim anything the demo state will not show on camera (lessons D3). Specifically confirm: the claim that measurements carry over when an existing performer is picked, and the claim about what Combine keeps.

- [ ] **Step 2: Write the script**

Format (the generator depends on it): `# <Title>, VO script`, a Voice line, one `## <Heading> (`<id>`)` per section, paragraphs separated by blank lines, director notes on lines starting with `>`. Every sentence 5 words or longer. Quote UI names exactly. No em-dashes. Sections 20 to 45 seconds of speech; whole video 2 to 4 minutes. The last section teases video 3, "Measurements".

Starting draft (rewrite wherever the code says otherwise):

```markdown
# Roles and Cast, VO script

Voice: Ava (en-US-AvaMultilingualNeural). Recorded against the Demo Theatre Co. org.

## Roles and cast (`intro`)

In the last video, we created Twelfth Night. Now it is time to fill it with characters and the people who will play them. We will add roles, let AI suggest them, cast performers, set up an ensemble, and tidy up a duplicate name.

## Suggest roles with AI (`ai-roles`)

Let's open Twelfth Night from the Productions page. A brand new show has no roles yet, so the workspace offers a shortcut.

> click: the "Twelfth Night" card

Choose "Suggest roles with AI," and in a few seconds the app lists the show's standard characters.

> point then click: "Suggest roles with AI"; hold through "Thinking…"

If the list looks right, choose "Add all roles," and every character lands in your workspace at once.

> point then click: "Add all roles"; hold on the new role list

For many well known shows, the list appears on its own, with no AI step at all.

## Add a role by hand (`add-roles`)

Need a character the list missed? Type it into the "Add a role" box, and choose "Add role."

> type: "Sea Captain", click "Add role"

For a group like the musicians, tick "Ensemble" before you add it. An ensemble has no primary or understudies, just a list of performers who each need a costume.

> type: "Musicians", tick "Ensemble", click "Add role"

## Cast a performer (`cast-performers`)

To cast a role, open its card and go to the "Cast & Measure" tab.

> click: the Viola row, then "Cast & Measure"

Choose "Add primary," type the performer's name, and add them as someone new.

> click "+ Add primary", type "Maya Brooks", click the "+ Add new" option

Understudies are tracked separately. Start typing in "Add understudy," and people already in the show appear in the list with their roles. Pick one, and their measurements come along, so you only ever take them once.

> open Olivia, "Cast & Measure", "+ Add understudy", type "Maya", point at the existing "Maya Brooks" option, click it

## Ensemble roles (`ensemble`)

Now let's fill the musicians. Open the ensemble role, and choose "Add performer" for each person in the group.

> open Musicians, "Cast & Measure", "+ Add performer" twice ("Theo Park", "Rosa Diaz")

When you close the card, its row shows how many performers the ensemble holds.

> collapse the card, zoom: "Ensemble · 2"

## Combine duplicates (`combine-duplicates`)

Sometimes the same person gets typed in twice, under two different roles. When a name appears more than once, the workspace tells you and offers "Combine duplicates."

> point: the notice, then click "Combine duplicates"

Check each group, where the entry that will be kept is marked, and choose "Combine selected." One entry per name remains, with every role moved onto it and the measurements carried over.

> point: the "Kept" chip, then click "Combine selected (1)"; hold on the cleared notice

## Wrap up (`wrap-up`)

That is how you build your cast: suggested or hand added roles, primaries and understudies, ensembles, and a tidy performer list. In the next video, we will take measurements for everyone we just cast. Thanks for watching.
```

- [ ] **Step 3: Render the narration and list sentences**

```bash
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video roles-and-cast
node scripts/list-vo-sentences.mjs --video roles-and-cast
```

Expected: every section renders, total narration 2 to 4 minutes. Check each paragraph's first sentence starts at `0.0` in its `sentences.json` (lessons E6).

- [ ] **Step 4: Em-dash sweep, commit, STOP**

```bash
grep -rn $'\u2014' docs/training-videos/scripts/roles-and-cast.md
git add docs/training-videos/scripts/roles-and-cast.md
git commit -m "docs(training): Roles and Cast narration script draft" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Report: the script, total narration seconds, and each section's wav directory. The controller shows Chris the script. Task 5 does not start until he approves it. If he edits it, re-run Step 3.

---

### Task 5: Video 2 walkthrough, record, build, QC (CHECKPOINT: Chris approves the MP4)

**Files:**
- Create: `scripts/lib/walkthroughs/roles-and-cast.mjs`
- Modify: `docs/training-videos/README.md` (status table, followups M5 fixes)

**Interfaces:**
- Consumes: approved script (Task 4), `list-vo-sentences.mjs` output for every `s:`, `resetTwelfthNight`, `ensureTwelfthNight`, `TWELFTH`, `TWELFTH_ROLES` (Task 3), `point(..., { steps })` and the lag fix (Tasks 1 and 2), recorder helpers `gotoAuthed`, `openRecord`, `point`, `zoom`, `hold`, `type`.

- [ ] **Step 1: Confirm selectors on the live page**

With the server running (`PORT=3000 npm start` against a fresh build), use `playwright-cli` signed in as the demo user (README "Manual sign-in check", with the port changed to 3000) on a Twelfth Night reset to each section's prep state. Confirm, and note any difference from the draft below: the accessible name of a collapsed role row button (`/^Viola/` must match only Viola's row), the picker input labels, the `+ Add new "…"` option's name, the existing-performer option's name, the ensemble count text, the combine notice and `Combine selected (1)`, and that nothing needed is below the fold at zoom 1.5 (use `point()`'s own scroll, or the wheel-scroll pattern in getting-started's `wrap-up`, where a target is low on the page).

- [ ] **Step 2: Write the walkthrough**

State plan (lessons D1, D2): every section converges Twelfth Night through `resetTwelfthNight` to exactly the state the viewer saw at the end of the previous section, so each section retakes alone. Only Twelfth Night is ever touched; the seeded productions are not.

| Section | Prep state |
|---|---|
| intro | `ensureTwelfthNight` (read-only if it exists) |
| ai-roles | Twelfth Night, no roles |
| add-roles | `TWELFTH_ROLES` |
| cast-performers | `TWELFTH_ROLES` + `Sea Captain`; ensemble `Musicians` |
| ensemble | as above + Viola primary `Maya Brooks`, Olivia understudy `Maya Brooks` (reuse) |
| combine-duplicates | as above + Musicians `Theo Park`, `Rosa Diaz`, Sebastian primary `Jordan Lee`, and a SECOND `Jordan Lee` (new performer) in Musicians |
| wrap-up | the state after the on-camera combine: as ensemble, plus ONE `Jordan Lee` cast as Sebastian primary and (reuse) in Musicians |

Draft (the `s:` values follow the draft script's sentence order; re-derive every one from `list-vo-sentences.mjs` output for the APPROVED script before recording):

```js
// Training video 2: "Roles and Cast". Script: docs/training-videos/scripts/roles-and-cast.md.
//
// DB state: only the demo org's "Twelfth Night" is touched. Each section's
// prep rebuilds it (lib/demo-productions.mjs resetTwelfthNight) to exactly
// what the viewer saw at the end of the previous section, so any section
// retakes alone. "ai-roles" films a live Haiku call through the app's own
// route, whose output varies; later sections start from TWELFTH_ROLES
// instead, so their retakes never depend on the model's answer.
import { TWELFTH, TWELFTH_ROLES, ensureTwelfthNight, resetTwelfthNight } from "../demo-productions.mjs";

const EXTRA_ROLE = "Sea Captain";
const ENSEMBLE = "Musicians";
const ROLES_AFTER_ADD = { roles: [...TWELFTH_ROLES, EXTRA_ROLE], ensembleRoles: [ENSEMBLE] };
const CAST_AFTER_CASTING = [
  { role: "Viola", name: "Maya Brooks" },
  { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
];
const CAST_AFTER_ENSEMBLE = [
  ...CAST_AFTER_CASTING,
  { role: ENSEMBLE, name: "Theo Park" },
  { role: ENSEMBLE, name: "Rosa Diaz" },
];
// The deliberate duplicate: two separate performer rows named Jordan Lee.
const CAST_WITH_DUPLICATE = [
  ...CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: ENSEMBLE, name: "Jordan Lee" },
];
// What the viewer is left with after "Combine selected": one Jordan Lee in both roles.
const CAST_AFTER_COMBINE = [
  ...CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: ENSEMBLE, name: "Jordan Lee", reuse: true },
];

// Set by each prep so openRecord's fallback goto is the real URL (the id
// changes on every reset). The row click is what is filmed.
let twelfthPath = "/productions";
const remember = ({ production }) => { twelfthPath = `/productions/${production.id}`; };

async function openTwelfth(page, h, s) {
  await h.gotoAuthed(page, "/productions");
  await h.hold(page, 900); // settle before the first beat (lessons F6)
  await h.openRecord(page, TWELFTH, twelfthPath, { headingRe: new RegExp(TWELFTH), s });
}

const roleRow = (page, name) => page.locator("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

async function openCastTab(page, h, roleName, s) {
  const row = roleRow(page, roleName);
  await h.point(page, row, { s });
  await h.hold(page, 600);
  await row.click();
  const tab = page.getByRole("button", { name: "Cast & Measure" });
  await tab.waitFor({ state: "visible", timeout: 4000 });
  await h.point(page, tab, { s, mark: false });
  await h.hold(page, 500);
  await tab.click();
  await h.hold(page, 700);
}

async function addNewViaPicker(page, h, label, name, s) {
  const opener = page.locator("main").getByRole("button", { name: `+ ${label}` });
  await h.point(page, opener, { s });
  await h.hold(page, 600);
  await opener.click();
  const input = page.getByLabel(label, { exact: true });
  await input.waitFor({ state: "visible", timeout: 4000 });
  await input.pressSequentially(name, { delay: 90 });
  await h.hold(page, 500);
  const addNew = page.getByRole("button", { name: /^\+ Add new/ });
  await h.point(page, addNew, { s, mark: false });
  await h.hold(page, 500);
  await addNew.click();
  await page.locator("main").getByText(name, { exact: true }).first().waitFor({ state: "visible", timeout: 6000 });
  await h.hold(page, 800);
}

export const WALKTHROUGH = {
  slug: "roles-and-cast",
  title: "Roles and Cast",
  guideAnchor: "roles",
  sections: [
    {
      id: "intro",
      heading: "Roles and cast",
      targetSeconds: 16,
      prep: async (api) => { await ensureTwelfthNight(api); },
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 1200);
        await h.point(page, page.locator("main").getByRole("link", { name: new RegExp(TWELFTH) }).first(), { s: 0 });
        await h.hold(page, 2500);
      },
    },
    {
      id: "ai-roles",
      heading: "Suggest roles with AI",
      targetSeconds: 30,
      prep: async (api) => remember(await resetTwelfthNight(api)),
      run: async (page, h) => {
        await openTwelfth(page, h, 0);
        const suggest = page.getByRole("button", { name: "Suggest roles with AI" });
        await h.point(page, suggest, { s: 1 });
        await h.hold(page, 900);
        await suggest.click();
        const addAll = page.getByRole("button", { name: "Add all roles" });
        const failed = page.getByText(/Couldn't get suggestions|AI suggestions are not configured|No suggestions found/);
        // One wait on either outcome (a Promise.race of two waitFors leaves
        // the loser pending, and its later timeout is an unhandled rejection).
        await addAll.or(failed).first().waitFor({ state: "visible", timeout: 30000 });
        if (await failed.isVisible()) {
          throw new Error("ai-roles: the AI suggestion call failed on camera; check ANTHROPIC_API_KEY in the server env and retake");
        }
        await h.hold(page, 1800); // let the suggested names be read
        await h.point(page, addAll, { s: 2 });
        await h.hold(page, 900);
        await addAll.click();
        await roleRow(page, "Viola").waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 1500);
        await h.point(page, roleRow(page, "Viola"), { s: 3 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "add-roles",
      heading: "Add a role by hand",
      targetSeconds: 28,
      prep: async (api) => remember(await resetTwelfthNight(api, { roles: TWELFTH_ROLES })),
      run: async (page, h) => {
        await openTwelfth(page, h, 0);
        const input = page.getByPlaceholder("Add a role (character)");
        const addBtn = page.locator("main").getByRole("button", { name: "Add role", exact: true });
        await h.point(page, input, { s: 0, mark: false });
        await h.type(page, 'input[placeholder="Add a role (character)"]', EXTRA_ROLE);
        await h.point(page, addBtn, { s: 0 });
        await h.hold(page, 600);
        await addBtn.click();
        await roleRow(page, EXTRA_ROLE).waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 1000);

        await h.point(page, input, { s: 1, mark: false });
        await h.type(page, 'input[placeholder="Add a role (character)"]', ENSEMBLE);
        const ensembleBox = page.locator("main form").getByLabel("Ensemble");
        await h.zoom(page, ensembleBox, { s: 1, holdMs: 2200 });
        await ensembleBox.check();
        await h.hold(page, 500);
        await h.point(page, addBtn, { s: 2 });
        await h.hold(page, 600);
        await addBtn.click();
        await roleRow(page, ENSEMBLE).waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 1500);
      },
    },
    {
      id: "cast-performers",
      heading: "Cast a performer",
      targetSeconds: 38,
      prep: async (api) => remember(await resetTwelfthNight(api, ROLES_AFTER_ADD)),
      run: async (page, h) => {
        await openTwelfth(page, h, null);
        await openCastTab(page, h, "Viola", 0);
        await addNewViaPicker(page, h, "Add primary", "Maya Brooks", 1);

        await openCastTab(page, h, "Olivia", 2);
        const opener = page.locator("main").getByRole("button", { name: "+ Add understudy" });
        await h.point(page, opener, { s: 2, mark: false });
        await h.hold(page, 500);
        await opener.click();
        const input = page.getByLabel("Add understudy", { exact: true });
        await input.waitFor({ state: "visible", timeout: 4000 });
        await input.pressSequentially("Maya", { delay: 90 });
        const existing = page.getByRole("button", { name: /Maya Brooks/ }).filter({ hasText: "Viola" }).first();
        await h.zoom(page, existing, { s: 3, holdMs: 2600 });
        await existing.click();
        await h.hold(page, 1500);
      },
    },
    {
      id: "ensemble",
      heading: "Ensemble roles",
      targetSeconds: 30,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_AFTER_CASTING })),
      run: async (page, h) => {
        await openTwelfth(page, h, null);
        await openCastTab(page, h, ENSEMBLE, 0);
        await addNewViaPicker(page, h, "Add performer", "Theo Park", 1);
        await addNewViaPicker(page, h, "Add performer", "Rosa Diaz", 1);
        await roleRow(page, ENSEMBLE).click(); // collapse
        await h.hold(page, 800);
        const count = page.locator("main").getByText("Ensemble · 2", { exact: true }).first();
        await h.zoom(page, count, { s: 2, holdMs: 2600 });
        await h.hold(page, 800);
      },
    },
    {
      id: "combine-duplicates",
      heading: "Combine duplicates",
      targetSeconds: 34,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_WITH_DUPLICATE })),
      run: async (page, h) => {
        await openTwelfth(page, h, null);
        const notice = page.locator("main").getByText(/1 name appears more than\s+once/).first();
        await h.point(page, notice, { s: 1 });
        await h.hold(page, 1200);
        const combine = page.locator("main").getByRole("button", { name: "Combine duplicates" });
        await h.point(page, combine, { s: 1, mark: false });
        await h.hold(page, 700);
        await combine.click();
        const kept = page.locator("main").getByText("Kept", { exact: true }).first();
        await kept.waitFor({ state: "visible", timeout: 6000 });
        await h.zoom(page, kept, { s: 2, holdMs: 2400 });
        const submit = page.locator("main").getByRole("button", { name: /^Combine selected \(1\)$/ });
        await h.point(page, submit, { s: 3 });
        await h.hold(page, 800);
        await submit.click();
        await notice.waitFor({ state: "hidden", timeout: 8000 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 16,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_AFTER_COMBINE })),
      run: async (page, h) => {
        await openTwelfth(page, h, 0);
        await h.hold(page, 3000);
      },
    },
  ],
};
```

Rules the draft follows and the final version must keep: every beat helper carries `s:` (use `null` only where the approved script has no sentence for that beat, and then the beat must also be `mark: false`, or better, restructure so the section's first marked beat is the first sentence it illustrates); `openTwelfth(..., null)` MUST become a real index or be changed to emit no beat (pass through `openRecord` only when a sentence names opening the show). A zoom target must be still for its whole `holdMs`. A click that follows a re-render asserts its result and may retry once (lessons B5).

After the `ai-roles` take, pull its beat frame and compare the AI's list with `TWELFTH_ROLES`. If they differ in a way a viewer would notice between sections (a missing lead, a very different count), update `TWELFTH_ROLES` in `lib/demo-productions.mjs` to the names Haiku returned, re-run that module's tests, and retake the later sections.

- [ ] **Step 3: Static checks**

Run: `node scripts/check-beat-annotations.mjs --video roles-and-cast; echo EXIT=$?`
Expected: `0 unannotated, 0 structural problem(s)`, `EXIT=0`.

- [ ] **Step 4: Seed, record, build, QC**

Fresh build of this branch, your own server on 3000, then (reseed immediately before the delivered pass, lessons D6):

```bash
DEMO_BASE_URL=http://localhost:3000 node scripts/seed-demo-org.mjs
DEMO_BASE_URL=http://localhost:3000 node scripts/record-training-video.mjs --video roles-and-cast > <scratch>/rec-rc.log 2>&1; echo EXIT=$?
grep -n 'point():\|zoom():\|openRecord():\|FAILED' <scratch>/rec-rc.log
node scripts/build-training-video.mjs --video roles-and-cast > <scratch>/build-rc.log 2>&1; echo EXIT=$?; tail -15 <scratch>/build-rc.log
node scripts/qc-training-video.mjs --video roles-and-cast
```

Note: the seeder deletes EVERY production in the demo org, including Twelfth Night; every section's prep recreates it, so that is fine. Expected: no FAILED sections, no park warnings (each one is a defect until a frame proves otherwise, lessons A3), the builder prints every section with `s:` equal to its beat count and refuses nothing, QC reports no unexplained freezes.

- [ ] **Step 5: Look at every QC image, count defects, fix**

Every beat frame: does the screen show what its sentence names, with the cursor PARKED (this is the first video recorded with the lag fix; a mid-glide freeze is a regression in Task 2's constant, report it, do not paper over it with a double point). Every zoom frame: sharp, on target, and the overlay's first frame shows no cursor jump (M12). Every contact sheet: no blank or loading frames, no sign-in flash, no stray cursor at (0,0), no error text, no `Thinking…` frozen for longer than the narration covers. Re-derive any disputed timestamp from `sync.json` and pull it with a direct `-ss` seek (lessons A2b). Count every defect, not just the first; retake only affected sections with `--section <id>`, rebuild, re-run QC.

- [ ] **Step 6: README and commit**

In `docs/training-videos/README.md` (followups M5): change the status table to

```markdown
| Video | Status | Date |
|-------|--------|------|
| getting-started | approved by Chris | 2026-09-23 |
| roles-and-cast | built, awaiting Chris | <date> |
```

add a step `0. One-time: node scripts/bootstrap-demo-org.mjs and npx playwright install chromium.` at the top of the pipeline list, and replace the "Server for steps 4 and 5" line with the port-3000 recipe from the `DEMO_BASE_URL` section (6100 is often held by someone else's dev server). Mark M5 partly done in `followups.md` (the edge-tts pin remains).

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
grep -rn $'\u2014' scripts/lib/walkthroughs/roles-and-cast.mjs scripts/lib/demo-productions.mjs docs/training-videos/README.md docs/training-videos/followups.md
git add scripts/lib/walkthroughs/roles-and-cast.mjs docs/training-videos/README.md docs/training-videos/followups.md
git commit -m "feat(training): Roles and Cast walkthrough recorded and built" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `scripts/lib/demo-productions.mjs` and its test to the `git add` only if Step 2 changed `TWELFTH_ROLES`.) Stop your server by port.

- [ ] **Step 7: STOP for Chris's review**

Report: MP4 and VTT paths, duration, the defects found and fixed with counts, whether any beat froze mid-glide, what the AI suggested on the delivered take, and judgment calls (pacing, zoom choices). The controller hands Chris the MP4. Iterate on his notes. Video 3 (measurements) is its own plan.
