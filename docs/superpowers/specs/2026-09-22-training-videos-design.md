# Training Videos (Ava narration) Design

Date: 2026-09-22
Status: design approved in chat by Chris 2026-09-22; spec awaiting review.

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

- `lib/record-core.mjs`: fresh authed Playwright context per section,
  1920x1080 viewport at `deviceScaleFactor: 2` (sharp zooms), raw take per
  section, beat and zoom-target logging.
- `lib/cursor-overlay.mjs`: injected on-camera cursor.
- `lib/beats.mjs`, `lib/cuts.mjs`, `lib/ffmpeg-cmd.mjs`: beat timing,
  bounded footage stretch (0.6x to 1.25x), ffmpeg command construction.
- `lib/training-video-manifest.mjs` plus `generate-training-video-manifest.mjs`.
- `record-training-video.mjs`, `build-narrated-video.mjs`,
  `list-vo-sentences.mjs`, `check-beat-annotations.mjs`.
- `lib/demo-target-guard.mjs`: refuses to seed or mutate any org other than
  the demo org.

### New

- `generate-training-vo.py` (run with `~/.venvs/edge-tts/bin/python`):
  renders `docs/training-videos/scripts/<slug>.md` paragraph by paragraph to
  `recordings/training/vo/<slug>/<section>/pNN.mp3` (converted to 24 kHz mono
  wav) plus `pNN.words.json` from edge-tts WordBoundary events. Content-hash
  cache per section: the hash covers the normalized paragraph text AND the
  voice, rate, and pitch, but a voice/rate/pitch change only prints a notice
  and never silently re-renders approved audio (`--force` or deleting the
  section dir re-renders). Text normalization (em-dashes to commas, etc.)
  happens on model input only. Retries on network failure, since edge-tts
  calls a Microsoft endpoint.
- Zoom beats: a beat may carry `zoom: { selector, scale, sentence }`. The
  recorder logs the target's bounding box at that moment; the builder applies
  an eased crop/scale (in 400 ms, hold, out 400 ms) over that sentence's time
  range, computed after the stretch. Scale defaults to 1.6, clamped so the
  crop never leaves the frame.
- Captions: `build-captions.mjs` turns word-boundary JSON into WebVTT cues
  (max two lines, about 42 characters per line, break at sentence ends),
  shifted by each paragraph's placement and the section stretch. Output
  `<slug>.vtt` beside the MP4.
- Title card: `lib/render-title-card.py` renders a 3 second 1920x1080 card
  (Fraunces title, Hanken subtitle, muslin background, Curtain Crimson
  `#c62828` rule) as the first segment. Font files (Fraunces, Hanken Grotesk, both OFL)
  are committed under `scripts/lib/assets/`, not read from system fonts.
- `seed-demo-org.mjs`: creates or refreshes "Demo Theatre Co." (dev Clerk org
  plus comped plan) with one fictional production: named cast, roles,
  measurements, designs, pieces with photos, suppliers, House Inventory items.
  Fixtures exercise real product behavior (computed yardage, real AI-estimate
  flow outputs stored as the app stores them, not hand-typed results).
  Idempotent, guarded by the target guard, and all fixture photos and
  generator code live in the repo.
- Per-section `prep(page, h)` resets: every section that mutates state
  declares an off-camera reset run before each take, checked against other
  videos' dependents.

## Data flow

```
scripts/<slug>.md ──> generate-training-vo.py ──> vo/<slug>/<section>/pNN.wav + words.json
seed-demo-org.mjs ──> demo org in shared Supabase + dev Clerk
walkthroughs/<slug>.mjs ──> record-training-video.mjs ──> raw/<slug>/<section>.webm + beats.json
                                      │
                 build-narrated-video.mjs (stretch, cursor beats, zoom beats,
                 title card, stitch) + build-captions.mjs
                                      │
                 recordings/training/out/<slug>.mp4 + <slug>.vtt
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
- Builder refuses a section whose required stretch is outside 0.6x to 1.25x
  and reports the gap so the script or choreography is fixed, not the clamp.

## Testing and QC

- Vitest unit tests on the pure parts: beats, cuts, ffmpeg command building,
  zoom crop math (clamping, easing ranges), caption cue building and time
  shifting, target guard, manifest.
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
