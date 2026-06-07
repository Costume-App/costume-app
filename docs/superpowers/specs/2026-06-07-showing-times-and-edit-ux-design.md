# Showing Times + Edit UX — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Builds on:** multiple show dates (Phase 1) and active/inactive (Phase 2), both merged.

## Problem

Three UX/data refinements ahead of the Monday demo:
1. The "Edit" link under the production title is an extra step — clicking the **title** should open the edit dialog.
2. A production can have **multiple showings on the same day** (matinee + evening). Each showing needs an optional **time**.
3. Dates should show the **day of the week** (e.g. "Sat, Jun 13, 2026") for quick readability.

## Goals

- Clicking the production name opens the edit dialog; remove the separate Edit link.
- Each showing is a date plus an optional time; the same date may repeat with different times.
- Times entered in the edit dialog; a read-only "Showings" list (date + time) appears on the detail page; the header shows the next showing with its time.
- Weekday prefix on every formatted date, app-wide.

## Non-goals

- No time-of-day "past" logic: active/inactive classification and sorting stay **date-level** (a showing is past once its day passes). `production-status` and `nextUpcomingDate`/`latestDate` are unchanged.
- No times on the list cards (cards get weekdays only; times live on the detail page).
- No timezone handling for times — stored/displayed as a wall-clock `time` exactly as entered.

## Data model

- Migration `supabase/migrations/0008_show_times.sql`:
  `alter table show_dates add column show_time time;` — nullable. Existing rows get `null` (time unknown). Multiple rows per date are already allowed (no unique constraint), so matinee + evening just become two rows.
- `ShowDate` interface gains `show_time: string | null` (Supabase returns a `time` column as e.g. `"14:00:00"`).

## Components / changes

### Date/time helpers — `src/lib/countdown.ts`

- `formatShowDate(isoDate)` — prepend weekday: `"Sat, Jun 13, 2026"`. Weekday from `new Date(Date.UTC(y, m-1, d)).getUTCDay()` against a `DAYS` array (date-only, no tz drift, consistent with the existing `toEpochDay`).
- New `formatShowTime(time: string): string` — `"14:00"` or `"14:00:00"` → `"2:00 PM"` (12-hour). Parses `HH:MM[:SS]`; returns `""` for empty/invalid.
- New small helper `formatShowDateTime(date, time | null)` is **not** added — callers compose `formatShowDate` + (`time` ? ` · ${formatShowTime(time)}` : "") inline to keep the helper surface small.

### Data layer — `src/lib/data/show-dates.ts`

- `addShowDate(productionId, date, time)` — `time: string | null`; trims date (`ValidationError` if empty); inserts `{ production_id, show_date, show_time: time || null }`.
- `listShowDates(productionIds)` — order by `show_date` asc, then `show_time` asc (`nullsFirst: false` so untimed showings sort after timed ones on the same date).

### API — `src/app/api/productions/[id]/show-dates/route.ts`

- `POST` body `{ date?: string; time?: string }` → `addShowDate(id, date, time ?? null)`.

### Create flow — `POST /api/productions`

- Unchanged signature; the first show date is still added without a time (the new-production form has no time field). `addShowDate(production.id, body.showDate)` becomes `addShowDate(production.id, body.showDate, null)`.

### Edit dialog — `src/components/EditableProductionHeader.tsx`

- **Title opens edit:** collapsed view renders the `<h1>` as a `button` (full-width, left-aligned, heading styles, subtle hover) that sets `editing = true`. The separate "Edit" link is removed.
- **Add showing:** the add row gains an optional `<input type="time">` beside the date input; "Add date" → `POST { date, time }` (time omitted/empty → null); clears both inputs on success.
- **Showing rows:** each row shows `formatShowDate(d.show_date)` + (`d.show_time` ? ` · ${formatShowTime(d.show_time)}` : "") with the Remove control.
- **Duplicate guard:** block only when an existing showing has the same `show_date` **and** the same `show_time` (so matinee + evening on one day is allowed); message "That showing is already added."
- The Make-inactive / past-guidance / red Done row is unchanged.

### Detail page — `src/app/productions/[id]/page.tsx`

- Compute the **next showing** = earliest row with `show_date >= today`, sorted by (date, time); fall back to the **latest** showing (by date, time) when none upcoming (past production) — mirrors today's date fallback.
- Header right column: `formatShowDate(nextShowing.show_date)` + time suffix; `CountdownBadge showDate={nextShowing.show_date}` (date-level). "Inactive" tag unchanged.
- New read-only **"Showings"** section (below the header, above `ProductionWorkspace`): a `lbl` "Showings" and a list of every showing `formatShowDate + · time`, sorted by date then time. Hidden when there are no showings.

## Error handling

- Empty date → `ValidationError` → 400 (existing mapping). Empty time is valid (stored null).
- Cross-org / missing → 404 via `assertProductionInOrg`.

## Testing

- `formatShowDate`: update existing tests for the new weekday prefix.
- `formatShowTime`: `"14:00"`→`"2:00 PM"`, `"09:30"`→`"9:30 AM"`, `"00:00"`→`"12:00 AM"`, `"12:00"`→`"12:00 PM"`, `"14:00:00"`→`"2:00 PM"`, `""`→`""`.
- `show-dates` data: `addShowDate` inserts `show_time` (value + null); `listShowDates` orders by date then time.
- `POST …/show-dates` route: passes `time` through (and null when absent).
- `POST /api/productions`: still creates the first date (now with null time) — update the existing assertion.
- UI components: no automated tests (consistent with the codebase); manual smoke.

## Migration / demo dependency

Non-functional for times until `0008_show_times.sql` is applied in Supabase (flagged manual step). Existing showings keep working with `null` time.
