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
