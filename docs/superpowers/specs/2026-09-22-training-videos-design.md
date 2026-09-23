# Training Videos (Ava narration) Design

Date: 2026-09-22
Status: design and spec approved by Chris 2026-09-22. Plan: `docs/superpowers/plans/2026-09-22-training-videos-pipeline.md` (pipeline plus video 1).

## Goal

A library of six short, narrated 16:9 training videos for Measure My Costume,
voiced by the Microsoft neural TTS voice Ava, embedded in the matching `/guide`
sections and available to the landing page. Videos must be cheap to update
when a feature changes: a script edit re-renders only its audio, a zoom or
timing tweak is a rebuild, and only a UI change forces a re-record.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Core workflow set, 6 videos of 2 to 4 minutes; prove the pipeline on video 1 before the rest |
| Format | Desktop 1920x1080, 16:9; in-app `/guide` embeds plus a landing-page slot |
| Recording target | Seeded demo org in the dev Clerk instance, local production build (`next build && next start`, port 6100) |
| Polish | Branded title card, WebVTT captions, zoom-ins on key controls; no music |
| Voice | `en-US-AvaMultilingualNeural` via edge-tts (`~/.venvs/edge-tts`) |
| Approach | Port the ListingStack harness (`listing-stack-headshot/scripts/`), swap Qwen3 for Ava, add zoom beats and captions |

Rejected: Remotion composition (second toolchain, license question on a client
project, discards a trusted ffmpeg builder); in-page CSS zoom (couples zoom to
the take, so every zoom change is a re-record, and risks reflow on camera).

## The video list

Each video is a walkthrough module of ordered sections. Section lists are
first drafts; the scripts may split or merge them.

1. **getting-started**: sign in, the Productions list, create a production,
   tour of the workspace tabs. Guide anchor `#productions`.
2. **roles-and-cast**: add roles, AI role suggestions, cast performers,
   ensemble roles, combine duplicate performers. Anchor `#roles`.
3. **measurements**: the measurement page, Prev/Next performer switcher (top
   and bottom), text inputs for iPad Scribble, front/back body diagram focus
   highlight, measurement form import from a photo. Anchor `#measurements`.
4. **costume-creations**: designs and pieces, maker assignment, piece photos,
   automatic fabric estimates, skirt yardage, purchase price and the cost
   total, logging a finished piece into House Inventory. Anchors `#designs`,
   `#creations`, `#fabric-ai`.
5. **house-inventory**: the photo tile grid, adding an item, reusing inventory
   in a production. Anchor `#inventory`.
6. **sharing-and-billing**: share a production's design layer by link, plans
   and checkout entry points (no real payment on camera). Anchors `#sharing`,
   `#billing`.

Every claim in a script is verified against the current code before it is
written (see the user-guide maintenance memo). Chris approves each script
before its video is recorded.

## Components

All under `scripts/` unless noted. Ported files keep their ListingStack tests,
adapted.

### Ported from ListingStack

- `lib/record-core.mjs` (desktop subset): fresh authed Playwright context
  per section (Clerk ticket redeemed off camera), 1920x1080 `recordVideo`,
  beat markers from `point()`, on-camera navigation helpers.
- `lib/cursor-overlay.mjs`: injected on-camera cursor.
- `lib/training.mjs`: walkthrough loading and validation, take paths.
- `build-synced-video.mjs` becomes `build-training-video.mjs`; its per-beat
  time-warp is extracted into a pure, tested `lib/sync-plan.mjs`.
- `record-training-video.mjs`, `list-vo-sentences.mjs`,
  `check-beat-annotations.mjs`.
- Not ported: `beats.mjs`, `cuts.mjs`, `ffmpeg-cmd.mjs` (those serve the
  ListingStack marketing demo, not the training library), mobile capture, and
  the Qwen/Whisper audio gates (Ava is deterministic and edge-tts returns word
  timings directly).

Correction found while planning (2026-09-22): Playwright's `recordVideo`
caps frames at the CSS viewport size regardless of `deviceScaleFactor`
(documented in the ListingStack record-core), so recording at 2x does not by
itself make zooms sharp. Measured screenshot capture at 1920x1080 @2x: 12 fps
PNG, 20 fps JPEG on a trivial page, too slow for smooth cursor motion.
Second finding: most app pages cap content at `max-w-2xl` (672 CSS px), a
thin column in a 1920-wide frame. Every take therefore applies a constant
CSS `zoom: 1.5` to the document (layout as if 1280x720, rendered crisply at
1920x1080). It never changes during a take, unlike the rejected per-beat
in-page zoom. Fallback if it breaks Clerk popovers or click targeting: a
1280x720 viewport upscaled to 1080p.

Resolution for zoom sharpness: record motion with normal 1080p `recordVideo`, and have each zoom
beat capture a 2x still (3840x2160) while the page holds still; the zoom's
ease-in, hold, and ease-out are all rendered from that still, so every zoomed
frame is sharp.

### New

- `generate-training-vo.py` (run with `~/.venvs/edge-tts/bin/python`):
  renders `docs/training-videos/scripts/<slug>.md` paragraph by paragraph to
  `recordings/training/vo/<slug>/<section>/pNN.wav` (24 kHz mono, loudness
  normalized) plus a per-section `sentences.json` carrying sentence and word
  timings from edge-tts WordBoundary events, and a per-video `manifest.json`. Content-hash
  cache per section: the hash covers the normalized paragraph text AND the
  voice, rate, and pitch, but a voice/rate/pitch change only prints a notice
  and never silently re-renders approved audio (`--force` or deleting the
  section dir re-renders). Text normalization (em-dashes to commas, etc.)
  happens on model input only. Retries on network failure, since edge-tts
  calls a Microsoft endpoint.
- Zoom beats: `h.zoom(page, target, { s, scale, holdMs })` parks the cursor,
  captures a 2x JPEG still, holds the page still for `holdMs`, and writes a
  marker with the target box and still path. The builder maps that raw window
  through the section's time-warp and overlays a zoompan clip rendered from
  the still (ease in 400 ms, hold, ease out 400 ms). Scale defaults to 1.6;
  the zoom rectangle is clamped so it never leaves the frame.
- Captions: `lib/captions.mjs` (called by the builder) turns word timings into WebVTT cues
  (max two lines, about 42 characters per line, break at sentence ends),
  shifted by each paragraph's placement and the section stretch. Output
  `<slug>.vtt` beside the MP4.
- Title card: `lib/title-card.mjs` renders a 1920x1080 PNG with Playwright
  from an HTML template (Fraunces title, Hanken Grotesk subtitle via Google
  Fonts, muslin background, Curtain Crimson `#c62828` rule), held 3 seconds at
  the start and end of each video. No Python and no committed font files.
- `bootstrap-demo-org.mjs` (run once): creates the dev Clerk demo user and
  "Demo Theatre Co." org, inserts the organizations row, comps it in
  `org_subscriptions`, and writes the ids to `scripts/lib/demo-org.json`.
- `seed-demo-org.mjs`: signs in as the demo user in an unrecorded headless
  browser and builds the fixtures through the app's own API routes (so
  computed values are what the product computes), after deleting the demo
  org's previous productions. The first plan seeds what video 1 needs: an
  active production (showings, roles including an ensemble, fictional cast,
  measurements) and an inactive past one. Designs, pieces with photos,
  suppliers, and House Inventory items are added by the plans for videos 2 to 6.
  Fixtures exercise real product behavior (computed yardage, real AI-estimate
  flow outputs stored as the app stores them, not hand-typed results).
  Idempotent, guarded by the target guard, and all fixture photos and
  generator code live in the repo.
- Per-section `prep(api)` resets (run off camera through the demo API): every section that mutates state
  declares an off-camera reset run before each take, checked against other
  videos' dependents.

## Data flow

```
scripts/<slug>.md ──> generate-training-vo.py ──> vo/<slug>/<section>/pNN.wav + sentences.json
seed-demo-org.mjs ──> demo org in shared Supabase + dev Clerk
walkthroughs/<slug>.mjs ──> record-training-video.mjs ──> raw/<slug>/<section>/*.webm + markers.json + zoom stills
                                      │
                 build-training-video.mjs (time-warp, zoom overlays,
                 title card, stitch, captions)
                                      │
                 recordings/training/out/<slug>.mp4 + <slug>.vtt + <slug>.sync.json
                                      │
                 QC (frame sampling across every section) ──> Chris approves
                                      │
                 upload to Supabase Storage bucket training-videos (public)
                                      │
                 <TrainingVideo slug=...> in /guide sections and landing
```

`recordings/` is added to `.gitignore`; everything that produces it is in the repo.

## Delivery

- New public Supabase Storage bucket `training-videos`, created in a
  migration (bucket plus read policy; no table, so no RLS table work).
- `src/components/TrainingVideo.tsx`: native `<video>` with `<track kind="captions">`,
  poster frame, `preload="none"`. Placed in the matching `/guide` sections.
  Landing-page placement is a slot, filled when Chris picks which video.
- The upload script and embed ship on a branch (standard lane: migration plus
  multi-file logic). Nothing is pushed or deployed without Chris's explicit
  go-ahead.

## Error handling

- Target guard: the seeder, preps, and recorder abort if the session's org id
  is not the demo org.
- Recorder aborts a take on any uncaught page error, toast error, or a beat
  selector that is not on camera (inside the viewport, not clipped), rather
  than recording a broken frame.
- TTS: failed render retries 3 times with backoff, then fails loudly naming the
  paragraph; a render whose duration is implausible for its word count fails.
- Builder clamps playback speed to 0.62x to 1.8x per beat span (the proven
  ListingStack values); beyond that it freezes the frame, caps dead air after a
  section's last sentence at 5 s, and prints per-section fit so a bad span is
  fixed in the script or choreography. QC flags any freeze of 6 s or more that
  is not a zoom hold or title card.

## Testing and QC

- Vitest unit tests on the pure parts: walkthrough validation, the sync
  planner, zoom geometry and the zoompan expression, caption cue packing,
  the demo-org guard, fixtures, the title-card template, and freeze parsing.
- Beat sentence indices come from `list-vo-sentences.mjs` output, never
  counted by hand; `check-beat-annotations.mjs` enforces it.
- QC per built video: sample frames across every section (not just starts)
  to catch frozen footage, check every zoom frame is sharp and on target, and
  play captions against audio at three points. Chris approves from the real
  MP4.

## Out of scope

- iPad-viewport takes (possible follow-up for the measurements video).
- Music bed, presenter/avatar footage.
- Videos for admin-only Fabric settings and the maker "My Work" view (next
  batch).

## Open items

- Which video goes on the landing page (Chris to pick after seeing video 1).
- edge-tts depends on an unofficial Microsoft endpoint; if it breaks, the
  fallback is Azure Speech with the same voice name (needs a key). Approved
  audio is cached, so an outage only blocks new renders.
