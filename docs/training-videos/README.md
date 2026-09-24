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

## Video status

| Video | Status | Date |
|-------|--------|------|
| getting-started | built, awaiting Chris | 2026-09-23 |
