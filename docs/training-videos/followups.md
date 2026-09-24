# Training videos: follow-ups

Carried forward from the final whole-branch review of `feat/training-videos`
(2026-09-23). Video 1 (getting-started) is approved and needs none of these.
Start the video 2 plan with item 1.

## 1. Beat mark lag (do first, before video 2)

Done 2026-09-23 on feat/training-video-2: FRAME_LAG_S = 0 s, measured with scripts/measure-frame-lag.mjs (see README) over 30 samples across 3 clean calibration takes (lag -0.124s to -0.083s, spread 0.041s), then confirmed on a fourth proof take (10 samples, all <= 0, none below -0.2). The `_probe` `lag` section's target `b` was swapped from the draft's "+ New Production" button (crimson background reads almost identically to the amber cursor dot in signalstats' V channel, diff 0.19 against threshold 6) to the header's "Inventory" nav link (plain text over the muslin-paper page background). The double-point workaround in getting-started.mjs stays until video 1 is next re-recorded.

Symptom in video 1: the wrap-up beat froze on a frame with the cursor still
gliding; worked around with an unmarked `point()` before the marked one in
`scripts/lib/walkthroughs/getting-started.mjs`. Remove that workaround once
this lands, and fold in M12 below.

Recommendation: fix it once, at the clock origin in `record()`, not with a delay inside `point()`.

Reasoning. Markers are rebased as `(m.at - clipT0)`, and `clipT0 = Date.now()` is taken after `await ctx.newPage()` resolves (record-core.mjs:128-130). Playwright's recordVideo timeline starts when the page is created, which happens inside that await, and the capture pipeline adds its own latency of about one to three frames. Both effects make a marker index a frame that is earlier than the event it names. That matches the observed symptom exactly: the frozen frame is 150 to 250 ms early and shows the cursor still gliding. The offset applies to every marker, and zoom markers included. A sleep added to `point()` would mask it only for point beats, and would add dead time to every beat for all six videos.

What to implement (prerequisite task for the video 2 plan):
1. In `record()`, take `clipT0` immediately before `ctx.newPage()`.
2. In `_probe`, calibrate once. Glide the cursor to a known point with `steps: 1`, mark, then find the first webm frame where the amber dot is at the target (ffmpeg crop plus `signalstats` or `blackdetect` on a crop). The difference is `FRAME_LAG_S`.
3. Apply that constant at the one rebase site: `t: (m.at - clipT0) / 1000 + FRAME_LAG_S`.
4. In `point()`, after `mouse.move`, await a double `requestAnimationFrame` through `page.evaluate` before `Date.now()`, so the mark follows a painted frame rather than the input dispatch.
5. Record `stillAt` for zoom beats (M12).
6. Remove the double-point workaround in `getting-started.mjs:196-223`. It stays valid if left in place, so this can wait until video 1 is next re-recorded.

Verify by re-running `_probe` and extracting the frame at each marker's `t`. The cursor has to be parked on every one.

## 2. Minor findings

- **M1** `bootstrap-demo-org.mjs:44,46`: use `insert` rather than `upsert`. The rows are new by construction, and an insert can never overwrite a shared-DB row, even if the id assumption were ever wrong. Related deferred minor: user-create followed by a failed org-create leaves an orphaned dev Clerk user. Log `user.id` before the org call so it can be deleted by hand.
- **M2** Done 2026-09-23. `record-core.mjs:229-232` (`gotoAuthed`): after `assertSignedIn`, read `window.Clerk.user.id` and `window.Clerk.organization.id` and call `assertDemoSession`. That makes the on-camera writes (write-path #7) directly guarded, not just guarded through inherited storageState. It is one evaluate call.
- **M3** `qc-training-video.mjs:19-28`: `slug` comes from argv unvalidated and is passed to `rmSync(qcDir(slug), { recursive: true })`. Today it is protected only because the sidecar read on line 25 happens first and fails for traversal paths. Validate with `/^_?[a-z0-9-]+$/` the way `loadWalkthrough` does.
- **M4** `docs/training-videos/README.md:28-38`, manual ticket recipe:
  - The curl omits `expires_in_seconds`, so Clerk's default of 30 days applies, and the README's "short-lived" is false. Add `"expires_in_seconds":300`.
  - The file is created at umask permissions and only then chmodded. Run `umask 077` first.
  - It depends on an exported `$CLERK_SECRET_KEY`, which the global rule forbids, and it never checks for `sk_test_`. Replace it with a `node -e` that imports `loadEnvLocalIntoProcess` and `mintSignInTicket` from `scripts/lib` and writes the token to the mode-600 file.
- **M5** Partly done 2026-09-23 on feat/training-video-2 (Task 5): the status
  table now says "approved by Chris" for video 1 and carries a row for
  roles-and-cast; the pipeline list has a step 0 for the one-time bootstrap
  (`node scripts/bootstrap-demo-org.mjs` and `npx playwright install
  chromium`); the "server for steps 4 and 5" line now gives the port-3000
  scratch-server recipe instead of assuming port 6100 is free. Still open:
  the README gives no way to create the `~/.venvs/edge-tts` venv.
  `boundary="WordBoundary"` needs edge-tts 7 or later, so pin it (for example
  a `scripts/requirements-training.txt`). This is the regeneration rule
  applied to the toolchain.
- **M6** `generate-training-vo.py:167,183`: `sentences.json` is regenerated only when the audio re-renders, so a change to `split_sentences` or `assign_words` leaves stale sentence splits that the cache reports as fresh. This is the global staleness-hash rule. Either include a `SENTENCES_VERSION` constant in the cache entry, or store the raw boundaries per paragraph so sentences.json can be rebuilt without TTS.
- **M7** `generate-training-vo.py:84-93`: a token/boundary count mismatch only prints a warning and spreads timing by characters. Sentence starts drive beat alignment, so that shifts beats as well as captions. Write a `"timing": "spread"` flag into sentences.json and have the builder list the affected paragraphs. (Video 1 is clean: no paragraph shows the all-contiguous signature of the fallback.)
- **M8** `build-training-video.mjs:96,125`: each section file is cut with `-t r.actual`, but its real length is quantized to frames and is never padded if it comes out short. Audio placement adds up the unquantized `r.actual`. Measured drift on video 1 is -0.026 s, which is harmless, but it grows with the section count and nothing checks it. Round `r.actual` to `Math.round(actual * FPS) / FPS` for both `-t` and `cursor`, or ffprobe each section file and advance `cursor` by its real duration.
- **M9** `build-training-video.mjs:116`: `absSentences` shifts `words` to absolute time but leaves `start`/`end` section-relative. `packCues` reads only words today, so the output is correct. Shift both so the next consumer does not inherit a mixed-timeline object.
- **M10** `build-training-video.mjs:45-47`: a script section that exists in `manifest.json` but not in the walkthrough has its narration dropped silently. Warn on unused manifest keys.
- **M11** `build-training-video.mjs:121` vs `:75`: `sync.json` `beat` is the index among the prepared markers, while zoom work files and stills use the recorder's `beat`. QC file names follow a third counter (`qc-training-video.mjs:39-41`). Emit the recorder's `m.beat` in the sidecar so beat images, zoom stills and markers.json share one number.
- **M12** Done 2026-09-23. `record-core.mjs:207-224` (`zoom()`): the zoom marker `at` is taken before the cursor glide and still capture, while `point()` marks after the glide. So the builder's zoom window (`b.t + 0.15`) starts while the live cursor is still moving, and at the overlay's first frame the cursor jumps to its parked position in the still. Record `stillAt` in `zoom` info and start the window there. This belongs with the point() fix below.
- **M13** Seeder role map (Task 7 deferred): `validateFixtures` should reject a role name that repeats within a production and a performer name that repeats within a production. The videos 2-6 fixtures will grow, and today the collision fails silently.
- **M14** Done 2026-09-23. `twelfthNightShowingDate` (getting-started.mjs:27-32) duplicates `showDate` from `demo-fixtures.mjs`. Use `showDate(10)`.
- **M15** Stale ported comments:
  - `list-vo-sentences.mjs:11,16` names `build-synced-video.mjs` and `plan.md N12`.
  - `check-beat-annotations.mjs:11,14,21` names `build-synced-video`, `plan.md N4` and `gotoContactCard` (all ListingStack).
  - `record-training-video.mjs:5-10` uses the example slug `productions-basics` and says "the owner narrates over the footage".
  - Point these at this repo's `build-training-video.mjs` and the spec.
- **M16** Commit hygiene:
  - In dc6b7fd, 0220dac, cf495c1, bcbe3d3 and 9caaafd the `Co-Authored-By` is on the subject line, so git does not parse it as a trailer.
  - ce9428a and 9caaafd carry a Haiku 4.5 trailer. That conflicts with the controller's practice of amending model trailers in Tasks 9 and 12.
  - Fix at squash-merge time, or accept as is.
