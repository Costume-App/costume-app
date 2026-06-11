# Showing Labels (Phase 3a) — Design

**Date:** 2026-06-11
**Status:** Approved

## Summary

Add an optional free-text **label** to each showing (e.g. "Tech rehearsal",
"Opening Night", or an alternate location), set wherever showings are entered and
shown wherever showings display. First slice of backlog item #3 (deadlines /
reminders); the label is also the hook for tagging the tech rehearsal that the
later deadline work references. See [[roadmap-nada-feedback-2026-06-10]] and the
parked [[roadmap-showing-note]] idea.

## Decisions (from brainstorming)

- **#3 is split** into 3a (labels — this), 3b (costumes-due date + countdown +
  in-app "what's outstanding" view), 3c (email reminders), built in that order.
- **Label is free-text** (optional, per showing) — not a preset list.
- (3b decision, recorded for later: the costumes-due deadline will be an explicit
  date the director sets, not auto-derived.)

## Data model — migration `0015`

(Next sequential migration; confirm number at build time.)

```sql
alter table show_dates add column if not exists label text;
```

Nullable; blank labels store as `null`.

## Data layer — `src/lib/data/show-dates.ts`

- `ShowDate` interface gains `label: string | null`.
- `addShowDate(productionId, date, time, label?)` — trims `label` to null and
  inserts it. (New 4th param, optional; existing callers still compile.)
- `updateShowDate(productionId, id, patch)` — `patch` gains optional `label`;
  when present, trim → null and include in the update.

## API

- `POST /api/productions/[id]/show-dates` — accept `label` in the body, pass to
  `addShowDate`.
- `PATCH /api/productions/[id]/show-dates/[dateId]` — accept `label`, pass into
  the `updateShowDate` patch.
- `POST /api/productions` (create) — the `showings[]` entries gain an optional
  `label`; pass each through to `addShowDate`.

## Entry points

- **Detail-page editor** `src/components/EditableProductionHeader.tsx`: each
  showing row (existing rows + the add-new row) gets an optional **Label** text
  input (placeholder e.g. "Label — e.g. Tech rehearsal"), saved on blur like the
  date/time fields, via the show-dates PATCH/POST.
- **Create form** `src/app/productions/new/page.tsx`: each showing row gains a
  label input. `normalizeShowings` carries `label` through. Dedupe stays by
  `(date, time)` — label is not part of a showing's identity; the first-seen
  row's label wins. `ShowingInput` gains `label: string | null`.

## Display — `src/components/ShowingsList.tsx`

Render the label alongside the date/time (e.g. `Sat, Jun 13, 2026 · 2:00 PM ·
Tech rehearsal`). Applies on both the productions list and the production detail
page (both use `ShowingsList`). Omit the label segment when null/blank.

## Testing

- `src/lib/showings.test.ts` — extend `normalizeShowings`: label carried through,
  blank label → null, dedupe still by (date,time) keeping the first label.
- `src/lib/data/show-dates.test.ts` — `addShowDate` writes a trimmed label / null;
  `updateShowDate` includes label in the patch when provided.
- show-dates route tests + productions route test — `label` passthrough.
- `EditableProductionHeader`, `ShowingsList`, create form — `npx tsc --noEmit`,
  `npm run lint`, manual.

## Affected / New Files

- New: `supabase/migrations/0015_show_date_labels.sql`
- Modified: `src/lib/data/show-dates.ts` (+ test)
- Modified: `src/lib/showings.ts` (+ test) — `label` on `ShowingInput` + normalize
- Modified: `src/app/api/productions/[id]/show-dates/route.ts` (+ test)
- Modified: `src/app/api/productions/[id]/show-dates/[dateId]/route.ts` (+ test)
- Modified: `src/app/api/productions/route.ts` (+ test) — create showings label
- Modified: `src/app/productions/new/page.tsx` — label input per row
- Modified: `src/components/EditableProductionHeader.tsx` — label input per showing
- Modified: `src/components/ShowingsList.tsx` — display label

## Out of Scope (later slices)

- Costumes-due date, countdown to it, in-app outstanding view (3b).
- Email/SMS reminders, cron, recipients (3c).
- Marking a showing as the deadline driver / auto-deriving the due date.
