# Quick Wins: Photo Cap + Height in Feet/Inches — Design

**Date:** 2026-06-10
**Status:** Approved

## Summary

Two small, no-migration changes from Nada's feedback (see
[[roadmap-nada-feedback-2026-06-10]]):

1. Raise the per-role photo cap from 4 to 6.
2. Enter and display performer **height** in feet + inches instead of raw inches.

The third feedback "quick win" — photos on costume pieces — was split out because
it needs a DB migration + Storage plumbing; it will be its own feature.

## 1. Role photo cap 4 → 6

The cap is a duplicated constant `MAX_PER_ROLE = 4` in two places:

- `src/components/RolePhotos.tsx:11` — client gate (hides the add button at the cap).
- `src/app/api/productions/[id]/roles/[roleId]/images/route.ts:11` — server gate;
  the POST validation throws when `countRoleImages(roleId) >= MAX_PER_ROLE`, and
  the error message references the cap.

Change both constants to `6`. Per decision, leave them as two separate constants
(do not extract a shared constant). No migration.

## 2. Height in feet/inches

Height is stored as a single numeric measurement in **inches** (`performer_measurements.value_numeric`,
`measurement_key = 'height'`, `unit = 'in'`, seeded in migration `0002_performers.sql`).
Storage and units do not change — only entry and display.

### Helper — `src/lib/height.ts` (pure, unit-tested)

```ts
export function splitHeight(totalInches: number): { feet: number; inches: number };
export function combineHeight(feet: number, inches: number): number;
export function formatHeight(totalInches: number): string; // e.g. 72 -> `6'0"`
```

- `splitHeight` rounds to the nearest whole inch and returns `feet = floor(n/12)`,
  `inches = n % 12` (clamped at 0 for negatives).
- `combineHeight(feet, inches) = feet * 12 + inches`.
- `formatHeight(n)` returns `` `${feet}'${inches}"` `` (e.g. `6'0"`, `0'5"`).

### Input — `src/components/MeasurementForm.tsx`

Special-case the `height` definition (`def.key === "height"`): render two small
number fields, **ft** and **in**, instead of the single inches box. Initialize
them by `splitHeight(initialValues.height)`. On blur, compute
`combineHeight(Number(ft||0), Number(in||0))` and save via the existing PUT to
`/api/performers/[performerId]/measurements` with `measurementKey: "height"`,
`valueNumeric: <total inches>`, `unit: "in"` (unchanged payload shape). Keep the
height entry reflected in the form's filled-count. All other measurement rows are
unchanged (single inches input).

### Display — read-only height as feet/inches

The read-only measurement chips are built from `MeasurementView` in
`src/lib/tailor-summary.ts` (currently `{ label, value, unit }`) and rendered in
`src/components/MakePieceRow.tsx` as `{value}{unit}` (e.g. `72in`).

- Add `key: string` to `MeasurementView` and populate it in
  `buildMeasurementsByCasting` (from `measurement_key`).
- In `MakePieceRow`, render a measurement whose `key === "height"` as
  `formatHeight(value)` (e.g. `6'0"`); all others render `{value}{unit}` as today.
- Grep for any other read-only height display site and apply `formatHeight` there
  too. (The performer detail page shows height through `MeasurementForm`, so the
  two-field input already covers it.)

## Testing

- `src/lib/height.test.ts` — unit tests: `splitHeight`/`combineHeight` round-trip,
  `formatHeight` (`72 -> 6'0"`, `65 -> 5'5"`, `5 -> 0'5"`), rounding, and negative
  clamp.
- Photo cap: the existing role-images route test should still pass; add/adjust a
  test asserting the cap is 6 (the route enforces and reports the cap).
- `MeasurementForm` / display changes verified via `npx tsc --noEmit`, `npm run lint`,
  and manual check (no React component tests in this repo).

## Affected / New Files

- New: `src/lib/height.ts`, `src/lib/height.test.ts`.
- Modified: `src/components/RolePhotos.tsx` (cap → 6).
- Modified: `src/app/api/productions/[id]/roles/[roleId]/images/route.ts` (cap → 6).
- Modified: `src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts` (cap test).
- Modified: `src/components/MeasurementForm.tsx` (ft/in height input).
- Modified: `src/lib/tailor-summary.ts` (`MeasurementView.key`).
- Modified: `src/components/MakePieceRow.tsx` (height display via `formatHeight`).

## Out of Scope

- Photos on costume pieces (separate feature; needs migration + Storage).
- Changing storage units or the measurements API payload shape.
- Feet/inches for any measurement other than height.
