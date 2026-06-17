# Additional Measurements + Body Diagram — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending spec review

## Summary

Nada asked to (1) finish adding the body-measurement options already drafted in migration `0024`, (2) add four more — Shirt size, Pant size, Shoe size, and Nape-to-floor — three of which are **non-numeric**, and (3) add a front/back body diagram that highlights where each measurement is taken.

Two product decisions were made during brainstorming:
- Non-numeric sizes (Shirt/Pant/Shoe) are stored and entered as **free text** (no constrained dropdown), with format hints in the placeholder/help text.
- The body diagram is **annotated with focus-highlighting**: each dimensional measurement has a marker on an SVG silhouette, and focusing/tapping a measurement field makes its marker glow.

All schema and seed changes go in the **single** `supabase/migrations/0024_additional_measurements.sql` file (per Chris's standing instruction). Nothing is applied to Supabase, committed for push, or deployed until Chris gives an explicit green light.

## Current system (as found)

- `measurement_definitions`: `key` (PK), `label`, `unit`, `input_type` (text, default `'number'` — present but currently always `'number'`), `help_text`, `display_order`. Seeded in `0002` (10 rows) and `0024` (6 rows drafted).
- `performer_measurements`: `id`, `performer_id` (FK), `measurement_key` (FK → definitions), **`value_numeric numeric NOT NULL`**, `unit`, `updated_at`; unique on `(performer_id, measurement_key)`.
- `listMeasurementDefinitions()` (`src/lib/data/measurement-definitions.ts`) selects `*` ordered by `display_order`.
- `MeasurementForm` (`src/components/MeasurementForm.tsx`) ignores `input_type` and renders a numeric input for every definition (height is a special two-field feet/inches case). Saves on blur to `/api/performers/{id}/measurements` as `{ measurementKey, valueNumeric, unit }`.
- `estimate-fabric.ts` serializes each measurement as `` `${m.label}: ${m.value}${m.unit}` `` into the Haiku prompt.
- Existing Vitest coverage: definition ordering, `upsertMeasurement` upsert + NaN rejection, the measurements route (GET/PUT, 400 on non-numeric, 404 cross-org), `aggregateMeasureStatus`, `buildMeasurementsByCasting`, estimate-fabric parsing.

## Decision 1 — Storage model (free text)

Non-numeric measurements are stored as text; numeric ones are unchanged.

### Schema (in `0024`)

```sql
alter table performer_measurements alter column value_numeric drop not null;
alter table performer_measurements add column if not exists value_text text;
alter table performer_measurements
  add constraint performer_measurements_value_present
  check (value_numeric is not null or value_text is not null);
```

A row holds **either** `value_numeric` (number defs) **or** `value_text` (text defs), never neither. `input_type` becomes meaningfully `number | text`.

### New definition rows (in `0024`)

Existing drafted rows stay (neck, arm_circumference, wrist, thigh, knee, head — all `number`/`in`, display_order 110–160). Append:

| key | label | input_type | unit | help_text | display_order |
|-----|-------|-----------|------|-----------|---------------|
| `nape_to_floor` | Nape to floor | `number` | `in` | Center back of neck straight down to the floor | 170 |
| `shirt_size` | Shirt size | `text` | `''` | e.g. XS · S · M · L · XL · XXL · XXXL | 180 |
| `pant_size` | Pant size | `text` | `''` | Waist/Inseam, e.g. 36/30 | 190 |
| `shoe_size` | Shoe size | `text` | `''` | e.g. Men's 10 or Women's 8.5 | 200 |

`unit` is `''` (empty, still NOT NULL) for text defs so the AI serializer appends no unit. Text rows must set `input_type` explicitly (the column default is `'number'`).

## Decision 2 — Form, API, AI

### MeasurementForm

Branch on `def.input_type`:
- `number` → existing numeric input (height keeps its two-field case).
- `text` → a text input; `help_text` drives the placeholder/hint; saves `valueText` (trimmed) on blur. Empty/whitespace clears via the existing "delete when blank" path rather than saving an empty row.

State for the body diagram (see Decision 3) is lifted into the form: an `activeKey` set on input focus and cleared on blur.

### API + data layer

- `/api/performers/[performerId]/measurements` PUT and `upsertMeasurement`: accept `valueText` for `text` defs and `valueNumeric` for `number` defs. Validation:
  - `number` def → value must be finite (unchanged); reject non-numeric (keep current 400).
  - `text` def → value must be a non-empty trimmed string; reject empty.
  - The endpoint looks up the def's `input_type` to decide which field to write and which validation to apply.
- `getMeasurements()` returns both `value_numeric` and `value_text`.

### estimate-fabric

Serialize using the text value when present: effectively `` `${label}: ${value_text ?? value_numeric}${unit}` ``. Text defs (unit `''`) render as `"Shirt size: L"`, `"Pant size: 36/30"`. Keeps useful signal for the yardage estimate without unit noise.

## Decision 3 — Body diagram

### Component

`src/components/BodyDiagram.tsx` — hand-authored **front** and **back** SVG silhouettes side by side, responsive, theme-consistent (muslin/curtain-red per the Atelier UI). Renders a marker (dot + short leader label) for each dimensional measurement.

### Marker map

`MEASUREMENT_MARKERS: Record<string, { view: 'front' | 'back'; x: number; y: number }>` co-located with the component.

- **Front:** height, head, neck, shoulder, chest, sleeve, arm_circumference, wrist, waist, hips, thigh, knee, inseam, outseam.
- **Back:** back_length, nape_to_floor.
- **No marker** (abstract): weight, shirt_size, pant_size, shoe_size. Focusing these highlights nothing (acceptable; optional subtle "no body location" note deferred — YAGNI).

Exact coordinates are tuned during implementation against the drawn silhouettes; the map is the single source of truth so labels and highlight share positions.

### Interaction

- `BodyDiagram` takes an `activeKey?: string` prop. The matching marker gets a highlighted state (glow/scale/curtain-red fill); others stay muted.
- On the measurement form, `BodyDiagram` sits in a **collapsible panel**; input focus sets `activeKey`, blur clears it. Tapping is covered because focus fires on tap.
- On `/guide`, the same component renders in **static labeled mode** (`activeKey` undefined, all labels visible) as a reference. If the guide doesn't already import definitions, the labels come from the marker map's static label text.

## Testing (TDD)

Write/extend tests first:

- **definitions** — ordering test still passes with new rows (no change expected).
- **upsertMeasurement / performers** — text path writes `value_text`; empty/whitespace text rejected; numeric path still rejects NaN; check constraint satisfied (number→numeric, text→text).
- **measurements route** — PUT a `text` def stores text and returns it; PUT empty text → 400; existing numeric 400 path unchanged.
- **estimate-fabric** — a text measurement serializes as `"Label: value"` with no unit; numeric unchanged.
- **BodyDiagram** — every dimensional key has a marker entry; abstract keys have none; passing `activeKey` applies the active class to exactly one marker.

No live AI or Supabase calls in tests; follow the repo's existing mock patterns.

## Scope / non-goals

- No constrained dropdown for shirt size (explicitly chosen: free text).
- No per-measurement illustrative imagery beyond markers on the silhouette.
- No client-side signed-URL refresh, email reminders, or other roadmap items.
- Body silhouettes are simple outline shapes, not anatomically detailed art.

## Rollout

1. TDD the data/API/AI changes; then build `MeasurementForm` text branch.
2. Build `BodyDiagram` + marker map; wire focus highlighting; add to form and `/guide`.
3. Apply `0024` to Supabase **only after** Chris's green light; commit; do not push/deploy until told ([[no-push-without-greenlight]]).
