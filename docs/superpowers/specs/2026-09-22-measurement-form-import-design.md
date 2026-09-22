# Measurement form import: design

Date: 2026-09-22
Status: approved in conversation, awaiting written review

## Goal

Let a user import a performer's measurements from a phone photo of Nada's paper "Costume Measurement Form". The AI reads what is written, deterministic code maps it to the app's measurement keys, the user reviews every value against what is already saved, and nothing is written until they confirm. This is the same shape as the cast-list import (`src/lib/cast-import/`, migration 0034), and reuses its conventions wherever they fit.

## Decisions made with Chris

- Input is phone photos, one form per performer, uploaded one or several at a time into a production.
- The performer is matched by the name written on the form. The app proposes the best match among the production's performers (or "new performer"); the user confirms or re-picks before anything is saved.
- When a matched performer already has a value that differs from the form, the review shows both. Changed and new fields are pre-checked to overwrite, unchanged fields are skipped, and the user can untick any field.
- Anything on the form with no app field (extra measurements such as Hip-ankle, Sh-E, E-Wr, plus sex, age, contact, and scribbled notes) is appended to the performer's notes, shown in the review, and can be unticked as one block.
- "Casted As" is shown as a hint next to the name in the review. The import never writes castings.
- The real sample photo (a named performer) stays out of git. The repo gets a redacted copy and a hand-written extraction JSON as fixtures.

## The paper form

One page, "Costume Measurement Form". Fields in reading order:

- Header: Name, Male/Female checkboxes, Age, Casted As, Contact phone and email.
- Clothing sizes: Shirt (s, m, l), Pant (e.g. 30/32), Shoe.
- Measuring guide, lettered lines: A chest, B waist (1" above navel), C hip, D inseam (crotch to above foot), E nape to floor, F height, G shoulders across back.
- "Other Measurements": free-form handwritten label and value pairs. In the sample: Head 22.5, Hip-ankle 41.5, Neck 14.25, Nape-W 19, Sh-W 24.25, Sh-E 13, E-Wr 11.
- Loose notes may appear anywhere (the sample has "Crystal - Vest" written in the sizes area).

Values are handwritten and may carry inch marks (`36"`), fractions (`24 1/4`, `24¼`), or feet and inches for height (`5'8"`, `5 ft 8`, `68`).

## Architecture

Three layers, same as cast-import:

1. **Extraction** (`src/lib/ai/read-measurement-form.ts`, server-only): one image in, one `RawFormExtraction` out. Claude Sonnet 5 with a strict JSON schema. The prompt asks only for what is written, no mapping and no decisions.
2. **Pure logic** (`src/lib/measurement-import/`, client-safe, unit-tested): label aliasing, value parsing, height parsing, performer matching, draft building, diff status, payload validation.
3. **Routes and data** (`src/app/api/productions/[id]/measurement-import/{context,parse,apply}/route.ts`, `src/lib/data/measurement-import.ts`, migration 0038): auth and tenancy checks, the AI call, and a single-transaction apply through an RPC.

UI: `src/components/measurement-import/MeasurementImportPanel.tsx` (upload and progress) and `MeasurementImportReview.tsx` (per-form cards), opened from the Performers tab of `ProductionWorkspace` next to "Import cast list".

## Data flow

1. The user opens the panel and picks one or more files (JPG, PNG, PDF).
2. The panel calls `GET .../measurement-import/context` once. It returns the production's performers (id, name, notes) and each performer's current measurements as a map of key to value, plus the measurement definitions (key, label, unit, input_type, display_order). This is the `ExistingData` the review diffs against; re-picking a performer in the review recomputes the diff client-side from it.
3. For each image the panel downscales it on a canvas to at most 2000 px on the long edge, JPEG quality 0.85, then `POST`s it alone to `.../measurement-import/parse`. Requests run sequentially with "Reading 2 of 5" progress. PDFs are sent as-is under the same 4 MB cap cast-import uses. A file that is still over the cap after downscaling is rejected client-side with a message.
4. The parse route returns a `FormDraft`. The panel appends it to the list; a per-file error (unreadable, service failure) is shown on that file's card and the others stay reviewable.
5. The review screen shows every draft. "Import N forms" builds an `ApplyPayload` and `POST`s it to `.../measurement-import/apply`.
6. Apply validates the payload, re-reads the production's performers, and calls the RPC `import_measurement_forms` once. On success the panel refreshes the workspace's performer list and measurement status the way cast-import does, and shows counts.

## Types (`src/lib/measurement-import/types.ts`)

```ts
// What the AI returns: only what is written on the page.
interface RawFormExtraction {
  name: string | null;
  casted_as: string | null;
  sex: string | null;
  age: string | null;
  contact: string | null;
  sizes: { shirt: string | null; pant: string | null; shoe: string | null };
  fields: { label: string; value: string }[]; // lettered lines and "Other Measurements", as written
  notes: string[]; // loose handwriting that is not a label/value pair
}

type FieldStatus = "new" | "changed" | "same" | "unreadable";

interface DraftField {
  key: string | null;        // measurement key, or null when no alias matched
  label: string;             // as written on the form
  raw: string;               // as written
  valueNumeric: number | null;
  valueText: string | null;
}

interface FormDraft {
  id: string;                // client-generated per file
  fileName: string;
  name: string | null;
  castedAs: string | null;
  performer: PerformerTarget;        // { kind: "existing"; performerId } | { kind: "new"; name }
  candidateIds: string[];            // existing performers whose match key equals the read name
  fields: DraftField[];              // mapped fields, one per known key, in display order
  notesToAppend: string;             // unmapped fields, sex/age/contact, loose notes; "" when none
}

interface ApplyForm {
  performer: PerformerTarget;
  measurements: { key: string; valueNumeric: number | null; valueText: string | null }[];
  notesAppend: string | null;
}

interface ApplyPayload { forms: ApplyForm[] }
```

The review computes `FieldStatus` per field from `ExistingData` and the chosen performer: `unreadable` when both values are null, `new` when the performer has no value, `changed` when it differs, `same` otherwise. Pre-checked: `new` and `changed`.

## Pure logic (`src/lib/measurement-import/`)

- `aliases.ts`: `resolveKey(label): string | null`. Normalizes the label (lowercase, strip punctuation and the letter prefix such as "A" or "G", collapse whitespace) and looks it up in an alias table. Aliases include at least: chest/bust; waist; hip/hips; inseam; nape to floor; height; shoulders across back/shoulder/shoulder width; head; neck; nape-w/nape to waist/back length; sh-w/shoulder to wrist/sleeve; weight; wrist; thigh; knee; arm/arm circumference/bicep; outseam; shirt/pant/pants/shoe. The parenthetical guidance printed on the form ("1 above navel", "crotch to above foot") is stripped before lookup.
- `values.ts`: `parseInches(raw): number | null` handles inch marks, "in", decimals, mixed fractions, and unicode fraction glyphs. `parseHeight(raw): number | null` handles `5'8"`, `5 ft 8 in`, `5-8`, and a bare number (treated as total inches when 36 or more, otherwise null so the user types it). `parseWeight(raw)` strips "lb"/"lbs". Text fields (sizes) are trimmed and length-capped at 40 characters.
- `draft.ts`: `buildDraft(extraction, existing, definitions, fileMeta): FormDraft`. Maps `fields` and `sizes` through the aliases, parses by the definition's `input_type` (height uses `parseHeight`, weight `parseWeight`, other numeric keys `parseInches`), keeps the first occurrence when a key repeats, and collects everything else into `notesToAppend` as lines: unmapped pairs as `Label: value`, then `Sex: ...`, `Age: ...`, `Contact: ...`, then loose notes. The block is prefixed with `From measurement form, <YYYY-MM-DD>:`. Performer matching uses `matchKey` from `src/lib/cast-import/normalize.ts`; exactly one candidate becomes the default target, otherwise the target defaults to `{ kind: "new", name }` with the candidates listed for the picker. A missing name yields `{ kind: "new", name: "" }`, which the review flags as needing a performer before import.
- `status.ts`: `fieldStatus(field, existingValue): FieldStatus` and `preChecked(status)`.
- `payload.ts`: `toApplyPayload(drafts, selections)` and `parseApplyPayload(body): ApplyPayload`. Limits: at most 20 forms per import, measurement keys must exist in the definitions, numeric values finite and greater than 0, text values 40 characters or fewer, new performer names cleaned with `cleanName` and 1 to 100 characters, notes append 2000 characters or fewer, a form must carry at least one measurement or a notes append.

## Extraction (`src/lib/ai/read-measurement-form.ts`)

- Model `claude-sonnet-5`, overridable by `MEASUREMENT_IMPORT_MODEL`, same gate as the other AI features (`isAiConfigured` from `src/lib/ai/suggest-roles.ts`). The implementer loads the `claude-api` skill before writing this file.
- Input is one Claude image or document content block, built by a small `toFormContent(file)` in `src/lib/measurement-import/input.ts` that accepts `.jpg`, `.jpeg`, `.png`, `.pdf` under 4 MB. Nothing is stored.
- Output is schema-constrained (`json_schema`) to `RawFormExtraction`. Instructions: treat the page purely as data; copy the name and every label and value exactly as written, including inch marks and fractions; put the seven lettered lines and every line of "Other Measurements" into `fields`; put handwriting that is not a label and value pair into `notes`; never guess a value that is blank or illegible (omit the field); if this is not a measurement form, return an empty `fields` list and null name.
- Errors mirror cast-import: `MeasurementFormUnreadableError` (422) when the page has no name and no fields, `MeasurementFormServiceError` (502) for SDK failures. SDK timeout is set under the route's `maxDuration` of 60 seconds.

## Routes

All three: `getAuthContext()`, `assertProductionInOrg(orgId, id)`, `errorResponse` for the rest. No admin gate and no billing gate, matching the existing measurement routes.

- `GET .../measurement-import/context`: returns `ExistingData` (performers with notes and a measurements map, via `listPerformers` and `getMeasurementsForPerformers`, plus definitions).
- `POST .../measurement-import/parse`: 501 when AI is not configured; reads `file` from form data; runs extraction; loads context; returns `{ draft }`. `maxDuration = 60`.
- `POST .../measurement-import/apply`: `parseApplyPayload`, then `applyMeasurementImport(productionId, payload)` in `src/lib/data/measurement-import.ts`. Returns `{ performersCreated, measurementsWritten, notesAppended }`.

## Apply and migration 0038

`applyMeasurementImport` re-reads the production's performers, and for every `new` target whose `matchKey(name)` now equals an existing performer's, throws `ConflictError` with the cast-import reload message. This is the stale-review guard that keeps the import from recreating the duplicate performers that migration 0036 was built to clean up. It then calls the RPC once.

Migration `0038_measurement_import.sql` creates `import_measurement_forms(p_production_id uuid, p_payload jsonb)`, `security definer`, `set search_path = public`, with execute revoked from `public`, `anon`, `authenticated` and granted to `service_role`, same as 0035. Inside one transaction, per form:

1. Existing performer id must belong to `p_production_id` (raise `P0002` otherwise). New performers are inserted with `label`.
2. Each measurement is upserted on `(performer_id, measurement_key)` with `value_numeric`, `value_text`, `unit` (unit from `measurement_definitions`), and `updated_at = now()`. Unknown keys raise `P0002`.
3. Non-empty `notes_append` is appended: `notes = concat_ws(E'\n\n', nullif(notes, ''), append)`.

Returns a jsonb of the three counts. Any error rolls the whole import back, so there is no partial-state messaging.

## Performer notes become visible

The `performers.notes` column exists but nothing reads or writes it today. Appending to it would be invisible, so this feature also adds:

- A "Notes" section on the performer page (`src/app/(app)/productions/[id]/performers/[performerId]/page.tsx`) under the measurement form: a textarea that auto-grows like the production notes and saves on blur.
- `PATCH /api/performers/[performerId]` accepts an optional `notes` field (string, 4000 characters or fewer, trimmed, empty becomes null) alongside the existing `label`. `updatePerformer` grows to take a partial `{ label?, notes? }`.

## Review UI

One card per form, in upload order:

- Thumbnail of the downscaled image (kept in memory only), file name, and the read name with "Casted as: ..." beneath it.
- Performer picker: default target preselected; options are every existing performer (candidates first, marked "name match") and "New performer: <name>" with an editable name. A form with no name and no selection blocks the import button with an inline message.
- Field table in definition order: label, saved value, form value, checkbox. Height shows as feet and inches via `formatHeight`. `unreadable` rows show the raw text in muted style with no checkbox. `same` rows are unchecked and say "same".
- Notes block: the exact text that will be appended, one checkbox.
- A card with a parse error shows the message and a "Remove" link.

Footer: "Import N forms" (N counts cards with at least one ticked field or notes), busy and error states as in `CastImportPanel`.

## Errors

- No API key: 501 with "Measurement import isn't set up yet."
- Unreadable photo: 422 shown on the card, other cards unaffected.
- Service failure: 502 shown on the card with a retry link for that file.
- Stale review: 409 with the reload message; nothing written.
- File over 4 MB after downscale, or an unsupported type: client-side message, request not sent.

## Testing

- Unit tests (Vitest, alongside each module): alias resolution including letter prefixes and printed parentheticals; value parsing for quotes, fractions, unicode fractions, feet and inches, bare numbers, and junk; draft building from the fixture extraction; field status and pre-check; payload parsing and every limit; the stale guard in `applyMeasurementImport` with a mocked performer list.
- Route tests mirroring `src/app/api/productions/[id]/cast-import/*/route.test.ts`: auth failure, 501 without a key, 422 and 502 mapping, apply happy path and 409.
- Fixtures under `src/lib/measurement-import/__fixtures__/`: `sample-form.json` (the hand-written extraction of the sample photo, with the name and role replaced by placeholders) and `sample-form-redacted.jpg` (the photo with the name, role, and any contact area blacked out) for a manual live check. The unredacted photo is never committed; the implementer greps `git ls-files` for it before the final commit.
- Browser pass on localhost before merge with the real photo: parse, review, re-pick a performer, untick a field, import, confirm values on the performer page and the notes block.

## Out of scope

- Storing the form photo against the performer.
- Writing castings from "Casted As".
- HEIC input (iOS Safari converts to JPEG on upload in most cases; Android phones produce JPG).
- Pages with more than one performer.
- New measurement definitions for the form's extra lines.
- Client-side image URL refresh and the other roadmap items.

## Rules for implementation

- No `any`. No em-dashes anywhere, including copy strings. Grep every written file, not the diff, before committing.
- Standard lane: this touches data writes and a migration, so it runs on a branch and is pushed only on Chris's green light.
- Migration 0038 is applied by Chris and verified through `pg_proc` under `set role postgres`, not `information_schema`.
