# Phase 1 — Multiple Show Dates + Editing — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Part of:** the "active/inactive productions" effort. Phase 2 (Active vs. "Past and Inactives" + relocate delete) is a separate spec that builds on this.

## Problem

A production currently has a single `productions.show_date` column. We need:
1. A production to have **many** show dates (a run of performances), addable as needed.
2. The ability to **edit** a production's name and its show dates after creation.
3. The app's "show date" displays (list cards, detail header, countdown) to reflect the **next upcoming** date rather than one fixed column.

This phase makes the data model and editing support multiple dates. It does **not** add the active/inactive split or sorting changes — that is Phase 2, which depends on this.

## Goals

- One-to-many show dates per production, with add/remove.
- Edit production title.
- All current single-date displays switch to "next upcoming date" computed from the set.
- No regression: the list and detail pages keep working with the new model.

## Non-goals (deferred to Phase 2)

- Active vs. "Past and Inactives" partitioning, the `is_active` flag, auto-inactive-by-date, the manual toggle, the new sort rules, and relocating the delete control. Phase 1 leaves list ordering and the delete control where they are.

## Data model

### New table `show_dates`

Migration `supabase/migrations/0006_show_dates.sql`:

```sql
create table if not exists show_dates (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  show_date     date not null,
  created_at    timestamptz not null default now()
);
create index if not exists show_dates_production_id_idx on show_dates(production_id);

-- migrate existing single dates into the new table
insert into show_dates (production_id, show_date)
select id, show_date from productions where show_date is not null;

-- one source of truth
alter table productions drop column show_date;
```

Chris runs this in the Supabase SQL editor (same workflow as 0001–0005), and confirms it ran before we rely on it.

### Types

- New `ShowDate` interface in `src/lib/data/show-dates.ts`:
  `{ id: string; production_id: string; show_date: string; created_at: string }`.
- `Production` interface in `src/lib/data/productions.ts` **loses** `show_date`.

## Components / changes

### Data layer

- **`src/lib/data/show-dates.ts`** (new):
  - `listShowDates(productionIds: string[]): Promise<ShowDate[]>` — batch fetch for the list page (mirrors `listCostumePieces(designIds)`); returns `[]` for an empty input.
  - `addShowDate(productionId: string, date: string): Promise<ShowDate>` — validates non-empty date (`ValidationError`), inserts, returns the row.
  - `deleteShowDate(productionId: string, id: string): Promise<void>` — delete scoped by `id` + `production_id`.
- **`src/lib/data/productions.ts`**:
  - Remove `show_date` from `Production` and `showDate` from `CreateProductionInput`/`createProduction` (no longer inserts a date).
  - Add `updateProduction(orgId: string, id: string, title: string): Promise<Production>` — validates non-empty title (`ValidationError`), updates scoped by `id`+`org_id`, returns row or throws `NotFoundError` (mirrors `updateCast`).

### Next-upcoming helper

Added to the **existing `src/lib/countdown.ts`** (it already owns `formatShowDate`/countdown logic; keeps date helpers together and avoids a name clash with `src/lib/data/show-dates.ts`):
- `nextUpcomingDate(dates: string[], today: string): string | null` — returns the smallest `show_date >= today`, or `null` if none upcoming. `today` is passed in (testable). `show_date` values are ISO `YYYY-MM-DD` strings, so lexical comparison is correct.
- `latestDate(dates: string[]): string | null` — max date, or `null` if empty. Phase 2 needs it; trivial, so include and test now.

Both are pure and unit-tested. Callers compute `today` as the current date in `YYYY-MM-DD` form.

### API

- **`POST /api/productions`** (existing): still accepts an optional `showDate` (the first date). After `createProduction`, if `showDate` is a non-empty string, call `addShowDate(production.id, showDate)`. Response unchanged shape (`{ production }`).
- **`PATCH /api/productions/[id]`** (add handler to the existing route file): body `{ title?: string }` → `assertProductionInOrg` → `updateProduction` → `{ production }`. (DELETE handler stays. `isActive` is added in Phase 2.)
- **`POST /api/productions/[id]/show-dates`** (new route): body `{ date: string }` → `assertProductionInOrg` → `addShowDate` → `{ showDate }`, 201.
- **`DELETE /api/productions/[id]/show-dates/[dateId]`** (new route): `assertProductionInOrg` → `deleteShowDate` → `{ ok: true }`. (Mirrors `casts/[castId]` sub-resource routes.)

### UI

- **Detail page `src/app/productions/[id]/page.tsx`**:
  - Server-side: fetch the production's show dates (`listShowDates([id])`), compute `nextUpcoming = nextUpcomingDate(dates, today)`; pass `nextUpcoming` to `CountdownBadge` and `formatShowDate` (instead of `production.show_date`).
  - Replace the static title block with a new client component **`EditableProductionHeader`** given `{ productionId, title, showDates }`. Collapsed: shows the title (and next-upcoming date/countdown stay in the header as today) plus a quiet **Edit** link. Expanded: a name input (save → `PATCH {title}`), a list of show dates each with a remove control (→ `DELETE …/show-dates/[dateId]`), and an add-date input (→ `POST …/show-dates`). Each successful action calls `router.refresh()`.
- **List page `src/app/productions/page.tsx`**:
  - Batch-fetch show dates for all productions (`listShowDates(productions.map(p => p.id))`), group by `production_id`, compute each card's next-upcoming date, and render that where `show_date` was used. Ordering is unchanged in Phase 1 (still the existing query order; Phase 2 changes sorting).
- **New-production form**: unchanged UI; it already posts a single optional `showDate`, which the POST route now stores as the first show date.

## Error handling

- Empty/invalid date → `ValidationError` → 400 (existing `errorResponse` mapping).
- Cross-org / missing production → `NotFoundError` → 404 via `assertProductionInOrg`.
- Client components surface errors inline and keep a `busy` state during requests (existing pattern).

## Testing

Vitest (project uses it; 114 tests currently green):
- `show-dates` data layer: `addShowDate` (insert + empty-date `ValidationError`), `deleteShowDate` (scoped delete + supabase error), `listShowDates` (queries by `production_id in (...)`, empty input → `[]`).
- `updateProduction`: title update happy path, empty title → `ValidationError`, missing → `NotFoundError`.
- `createProduction`: updated test (no longer passes `showDate`).
- `nextUpcomingDate` / `latestDate` helpers (in `countdown.ts`): upcoming picks soonest ≥ today; all-past → `null`; empty → `null`; `latestDate` picks max.
- Route tests: `POST …/show-dates` (201 + 400 empty), `DELETE …/show-dates/[dateId]` (200 + 404 cross-org), `PATCH /api/productions/[id]` (200 title update + 404 cross-org).

## Migration / demo dependency

The feature is non-functional until `0006_show_dates.sql` is applied in Supabase. This is a flagged manual step. Existing productions' dates are preserved by the migration's `insert ... select`.
