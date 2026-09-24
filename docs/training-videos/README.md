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

## DEMO_BASE_URL

Both the seeder and the recorder read the server origin from `DEMO_BASE_URL`,
defaulting to `http://localhost:6100`. Both scripts refuse to run against a
server that is not serving THIS repo's fresh production build: they read
`.next/BUILD_ID` and require a 200 from
`${DEMO_BASE_URL}/_next/static/<BUILD_ID>/_buildManifest.js`. A `next dev`
process, or a `next start` still running an older build, fails that check
with a clear error naming the base and the build id, not a silent recording
of the wrong UI.

Port 6100 is the shared local default (see `~/projects/PORTS.md`) and may
already be held by someone else's dev server. Recordings for video 1 used a
scratch production server on port 3000 instead:

```bash
npm run build && DEMO_BASE_URL=http://localhost:3000 PORT=3000 npm start
DEMO_BASE_URL=http://localhost:3000 node scripts/seed-demo-org.mjs
DEMO_BASE_URL=http://localhost:3000 node scripts/record-training-video.mjs --video <slug>
```

Set `DEMO_BASE_URL` to whatever port the scratch server actually uses; the
important part is that it points at a `npm start` you started yourself
against a build you just made, never at a port you do not own.

## Manual sign-in check

To sign in as the demo user by hand (outside the recorder, for a spot check
in a real browser tab):

1. Read `clerkUserId` out of `demo-org.json`.
2. Mint a sign-in ticket for that user with the dev `CLERK_SECRET_KEY`, and
   write the response to a mode-600 file in the scratchpad rather than the
   shell history or a log:

   ```bash
   curl -s -X POST 'https://api.clerk.com/v1/sign_in_tokens' \
     -H "Authorization: Bearer $CLERK_SECRET_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"user_id":"<clerkUserId>"}' > /path/to/scratchpad/ticket.json
   chmod 600 /path/to/scratchpad/ticket.json
   ```

3. Pull the `token` field out of that file and visit
   `http://localhost:6100/sign-in?__clerk_ticket=<token>` in a browser. The
   ticket is single-use and short-lived; mint a fresh one for each check.

Never print the token or the secret key to a terminal transcript.

## Frame-lag calibration

Beat marks are rebased with `FRAME_LAG_S` (`scripts/lib/markers.mjs`), the
measured delay between a painted cursor move and the recorded frame that
shows it. Re-measure after a Playwright upgrade or on a different machine:
record `--video _probe --section lag` three times, run
`node scripts/measure-frame-lag.mjs --video _probe --section lag` after each,
and add `lagConstant` over all samples to the current value. A correct
constant makes every measured lag `<= 0`.

## Video status

| Video | Status | Date |
|-------|--------|------|
| getting-started | built, awaiting Chris | 2026-09-23 |
