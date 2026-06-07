# Phase 2 — Active vs. "Past and Inactives" + relocate delete — Design

**Date:** 2026-06-06
**Status:** Approved (decisions locked during the 2026-06-06 brainstorm; pending spec review)
**Builds on:** Phase 1 (`2026-06-06-multiple-show-dates-design.md`) — productions already have a one-to-many `show_dates` set and `nextUpcomingDate`/`latestDate` helpers.

## Problem

The productions list shows every production in one flat list ordered by creation. We want:
1. A production sorted by its **soonest upcoming** show date (next performance first).
2. A production that **auto-moves to a "Past and Inactives" group** once its final show date has passed.
3. A manual **"Make inactive"** (hide) / **"Make active"** (unhide) control.
4. The **delete** control moved from the header to the very bottom of the detail page.

## Locked decisions (from brainstorm)

- **Which date:** active list sorts by each production's **next upcoming** date; a production auto-passes only after its **final (latest)** date is in the past.
- **Unified group:** a production is in "Past and Inactives" if it was **manually hidden** OR **all its dates have passed**.
- **Reactivation:** "Make active" un-hides a manually-hidden production; a production whose dates have all passed is revived by **editing in a new upcoming date** (Phase 1 edit UI).
- **Section name:** the collapsed group is titled **"Past and Inactives"**.
- **Friction:** "Make inactive"/"Make active" is **one click, no confirm**. Delete keeps its type-to-confirm gate.

## Status model (derived at read time — no cron)

A production's effective status is computed from `is_active` + its show dates + today:

- `inactive` — `is_active = false` (manually hidden), regardless of dates.
- `past` — `is_active = true` but it has dates and `latestDate < today`.
- `active` — otherwise (`is_active = true` and (no dates yet OR `latestDate >= today`)).

The list's two buckets: **Active** = status `active`; **Past and Inactives** = status `past` or `inactive`.

**Sorting:**
- Active: by `nextUpcomingDate` ascending (soonest first); productions with no upcoming date (undated) sort last, newest-created first.
- Past and Inactives: by `latestDate` descending (most recent first); undated last, newest-created first.

This logic lives in a pure, unit-tested module `src/lib/production-status.ts` (`today` passed in).

## Data model

- Migration `supabase/migrations/0007_productions_is_active.sql`:
  `alter table productions add column is_active boolean not null default true;`
  (Existing rows stay active. Chris runs it in the Supabase SQL editor.)
- `Production` interface gains `is_active: boolean`.

## Components / changes

### Status helper — `src/lib/production-status.ts` (new, pure + tested)

- `classifyProduction(isActive: boolean, dates: string[], today: string): "active" | "past" | "inactive"`.
- `partitionProductions<T extends { id; is_active; created_at; dates: string[] }>(productions: T[], today: string): { active: T[]; inactive: T[] }` — classifies, then sorts each bucket per the rules above. (`inactive` here = the combined "Past and Inactives" bucket.)

### Data layer

- `setProductionActive(orgId: string, id: string, isActive: boolean): Promise<Production>` in `productions.ts` — scoped update of `is_active`, returns the row or throws `NotFoundError` (mirrors `updateProduction`).

### API

- `PATCH /api/productions/[id]` (extend the Phase 1 handler): body `{ title?: string; isActive?: boolean }`. If `isActive` is a boolean → `setProductionActive`; else → `updateProduction(title)`. Returns `{ production }`. (Title edits and active toggles are separate calls from the UI.)

### List page (`/productions`)

- Server component builds `{ id, is_active, created_at, dates }` for each production (dates from the existing `listShowDates` batch), calls `partitionProductions(…, todayIso())`.
- **Active** bucket renders as the current cards, in the new order, each card showing its `nextUpcomingDate`.
- **Past and Inactives** bucket is handed to a new client component **`PastAndInactiveProductions`**: if non-empty, a quiet **"Show past & inactive (N)"** toggle at the bottom expands the group (heading "Past and Inactives"). Each row links to the detail page, shows its date (`nextUpcomingDate ?? latestDate`) + countdown badge, and has a quick **"Make active"** link → `PATCH { isActive: true }` → `router.refresh()` (it then hops to the Active list if it has an upcoming date).

### Detail page (`/productions/[id]`)

- **Status tag:** a muted tag beside the title — **"Inactive"** when manually hidden, **"Past"** when its dates have passed; nothing when active.
- **Header:** remove `DeleteProductionButton` from the back-link row (back to just the back-link).
- **Bottom footer** (after `ProductionWorkspace`): a new client component **`ToggleProductionActiveButton`** ({ productionId, isActive }) showing **"Make inactive"** (when `is_active`) / **"Make active"** (when not) — one click → `PATCH { isActive }` → `router.refresh()`; plus the relocated **`DeleteProductionButton`**.
- **Delete control:** switch `DeleteProductionButton` from the absolute popover (chosen when it lived in the cramped header) back to a simple **inline expand** panel — cleaner now that it sits in a full-width block at the page bottom.

## Error handling

- Toggle/delete failures surface inline with a `busy` state (existing pattern).
- Cross-org / missing → `NotFoundError` → 404 via `assertProductionInOrg`.

## Testing

- `production-status` helper: `classifyProduction` (active / past / inactive incl. undated-active and manually-inactive-with-past-dates); `partitionProductions` (bucketing + both sort orders incl. undated-last tiebreak).
- `setProductionActive`: happy path + `NotFoundError`.
- `PATCH /api/productions/[id]`: `isActive` true/false routes to `setProductionActive` (200); title still works; 404 cross-org.
- UI components: no automated tests (consistent with the codebase); manual smoke.

## Migration / demo dependency

Non-functional until `0007_productions_is_active.sql` is applied in Supabase. Flagged manual step.
