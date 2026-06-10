# Multiple Showings on the Create Form — Design

**Date:** 2026-06-10
**Status:** Approved

## Summary

Bring multiple dates + optional times to the **New Production** form. Today the
create form accepts only a single date (no time); the production *detail* page
already has a full multi-showing editor and the database/data layer already
support many dated showings each with an optional time. This change surfaces
multi-showing entry at creation time.

## Decisions (from brainstorming)

- **Component approach:** Self-contained editor on the create form. It manages an
  in-memory list of showing rows and submits them all at once on create. It does
  NOT share a component with the detail page's `EditableProductionHeader`, because
  the two have different persistence models (the detail page persists each row
  immediately via API since the production already exists; the create form has no
  production yet and batches on submit). Lower coupling, less risk.
- **Required?** Showings stay optional — a production can be created with no
  dates and have them added later. Title remains the only required field.
- **Scope:** Date + optional time per showing only. The per-showing note/label
  roadmap idea is explicitly out of scope.

## UI — `src/app/productions/new/page.tsx`

Replace the single "Show date" input with a **Showings** section that mirrors the
detail page's editor layout (same Atelier classes):

- A list of rows; each row = a `type="date"` input (`flex-1`), an optional
  `type="time"` input (`w-32`), and a **Remove** link.
- An **Add date** button appends a blank row.
- The form starts with one empty row.
- Local state: `showings: { date: string; time: string }[]`.
- Title stays required; showings are optional.
- On submit: run the rows through `normalizeShowings` (below) and send the result
  as a `showings` array in the POST body.

## Testable seam — `normalizeShowings`

A pure helper (new file `src/lib/showings.ts`) used by the form before submit:

```ts
export interface ShowingInput { date: string; time: string | null }

// Trim dates, drop rows with a blank date, normalize blank time to null, and
// dedupe exact (date, time) pairs — preserving first-seen order.
export function normalizeShowings(
  rows: { date: string; time: string }[],
): ShowingInput[];
```

Unit-tested with Vitest (drops blank-date rows, blank time → null, dedupes exact
duplicates, preserves order).

## API — `src/app/api/productions/route.ts`

The POST handler accepts a new optional field:

```ts
showings?: { date: string; time?: string | null }[]
```

After creating the production and the default "Main Cast":

1. If `body.showings` is an array, create each via `addShowDate(production.id,
   date, time)` for every row whose `date` is a non-empty string (skip blanks).
2. Else, preserve the existing fallback: if `body.showDate` is a non-empty
   string, `addShowDate(production.id, showDate, null)` (back-compat; keeps the
   existing route test and any other caller working).

No data-layer change — `addShowDate(productionId, date, time)` already exists and
handles the optional time. **No SQL migration** (the `show_dates` table with
`show_date` + nullable `show_time` is already on prod).

## Error Handling

Follows existing route conventions: errors flow through `errorResponse`. The
client only submits rows whose date is non-empty (HTML `type="date"` yields a
valid ISO date or empty string), so `addShowDate`'s empty-date guard is not hit
in normal use. Note: as today, the production is created before showings are
added, so a mid-loop failure would leave a production with partial showings —
this matches the current single-date behavior and is acceptable.

## Testing

- `src/lib/showings.test.ts` — unit tests for `normalizeShowings`.
- `src/app/api/productions/route.test.ts` — add a case asserting the `showings[]`
  path calls `addShowDate` once per valid row with the right args; keep the
  existing `showDate` fallback test passing.
- The form component is verified via `npx tsc --noEmit`, `npm run lint`, and
  manual check (consistent with how this codebase treats React components).

## Affected / New Files

- New: `src/lib/showings.ts` (`normalizeShowings`, `ShowingInput`).
- New: `src/lib/showings.test.ts`.
- Modified: `src/app/productions/new/page.tsx` (multi-showing UI).
- Modified: `src/app/api/productions/route.ts` (accept `showings[]`).
- Modified: `src/app/api/productions/route.test.ts` (multi-showing test).

## Out of Scope

- Sharing a component with `EditableProductionHeader`.
- Per-showing note/label.
- Any change to the `show_dates` schema.
