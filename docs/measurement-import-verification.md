# Measurement form import: verification record

Date: 2026-09-22. Branch `feat/measurement-form-import`. Local `next dev` on port 6100, shared Supabase with migration 0038 applied.
Driven with playwright-cli in a headed browser, signed in as a test account whose org was comped for the pass.
Test data: a throwaway production "Import Test" with one role and one performer ("Existing Tester", chest 40, notes "Pre-existing note.").
The sample photo is a real filled-in form and is not committed.

## Browser pass

| Step | Result |
|------|--------|
| 1. Open "Import measurement forms" | Panel opens next to "Import cast list". Photo input stays disabled until the production context loads. |
| 2. Upload the sample form | Card shows the read name, thumbnail, "Casted as: George Banks", nine rows and a notes block (after the fix below). Read took about 3.5 s. |
| 3. Re-pick the existing performer | Chest shows "40 / 36 changed", ticked by default; unticked for the import. |
| 4. Import | "Imported 7 measurements, notes for 1." (first run, eight rows before the inseam fix, chest unticked). |
| 5. Performer page | Waist 31, hips 39, shoulder 19.5, sleeve 24.25, back length 19, neck 14.25, head 22.5; chest still 40. Notes appended after "Pre-existing note." with a blank line. |
| 6. Edit notes, blur, reload | Edit kept. |
| 7. Blank new name | Per-card "Pick a performer above, or type a name for the new one.", "Give every form a performer before importing.", button "Import 0 forms" disabled. After typing a name: "Imported 8 measurements, 1 new performer, notes for 1." The new performer is returned by the context API with all values and notes. |
| 8. Non-form photo (a bird) | "Couldn't find a measurement form in that photo. Check it is the right photo and try again." with Remove; parse returned 422. |
| Cancel mid-read | Close is disabled while a read runs. Navigating away mid-read aborted the parse request (net::ERR_ABORTED) with no console errors. |

A screenshot of the performer measurement page was also "read" as a form. It genuinely holds measurements, so this is not a defect, only a note that any image with measurement labels will produce a card.

## Defects found and fixed (31976a5)

1. Inseam fell into the notes block on every read. The model returned "D inseam crotch to above foot" without the printed parentheses, which the exact-match normalizer strips only when present. Fix: exact aliases for the paren-less inseam and waist guidance. Re-read after the fix shows the Inseam row (29.5) and no inseam line in notes.
2. The notes header was dated 2026-09-23 on the evening of 2026-09-22 (server UTC day). Fix: the panel sends the browser's local date; the parse route accepts only YYYY-MM-DD and otherwise falls back to UTC. Re-read shows 2026-09-22.

Both fixes are test-first: alias cases, `localIsoDate`, `formDate`, and a parse route test for the posted date. 146 measurement-import tests pass; tsc and eslint clean.

## Observations, no change

- The model's reading of the free-text note varies between reads ("Crystal - Vest", "Crystal- Vest", "Crystal - vest"). The reviewer sees and can untick it before import.

## Stress pass (same session)

- Validation: 33 malformed apply bodies (bad JSON, wrong types, `__proto__`/`constructor` keys, over-length, duplicates, stale ids) all 4xx, none 5xx.
- Hostile input: an `<img onerror>` name and a `<script>` notes block stored as literal text, rendered inert on the performer page and workspace.
- Tenancy: another org's production is 404 on context, parse and apply; its performer is 404 on PATCH and 409 as an import target.
- Concurrency: 15 parallel note appends kept all 15; 12 racing upserts and 10 racing PATCHes each ended on one winner, no 5xx.
- UI: double-click Import sends one request; a 502 read shows the message and "Try again", which recovers; a 409 import keeps the card; controls disable while reading; no overflow at 390x844.
- Fixed (3ab6d42): PATCH `{ notes: 5 }` cleared the notes with a 200. Now 400.
- Open, not fixed: parallel imports can push notes past the 4000 cap (5 parallel appends reached 4155), and parallel imports of the same new name can create duplicates (10 requests made 6). Both checks run in TypeScript before the RPC, so closing them means migration 0039.
- Matches main, not changed: the import accepts any positive number and ignores field type, like the manual measurement route; a non-UUID production id is a 500 from the shared `assertProductionInOrg`.

## Database smoke test

`docs/measurement-import-smoke.sql` run in the Supabase SQL editor: raised `P0001: SMOKE PASSED: all 5 checks ok, everything rolled back` (the intended outcome; the exception undoes every write).
