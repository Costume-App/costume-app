# Costumes-Due Date + Countdown + Outstanding Roll-up (Phase 3b) — Design

**Date:** 2026-06-11
**Status:** Approved

## Summary

Give each production an explicit **costumes-due date** the director sets, show a
**countdown** to it, and an at-a-glance **outstanding roll-up** ("M of T made · N
still to make") on the production detail page and the Tailor's summary. The
detailed to-make list already exists (the Tailor's-summary worklist); 3b adds the
deadline + the roll-up. Second slice of backlog item #3. No external services
(reminders are 3c). See [[roadmap-nada-feedback-2026-06-10]].

## Decisions (from brainstorming)

- Costumes-due is an **explicit date** the director sets (not auto-derived).
- Outstanding is a **roll-up stat + countdown** that reuses the existing worklist
  (no separate outstanding page).
- Shown on the **production detail page** and the **Tailor's summary page** (NOT
  the productions list cards).

## Data model — migration `0016`

(Next sequential migration; confirm number at build time.)

```sql
alter table productions add column if not exists costumes_due_date date;
```

Nullable; null = no deadline set.

## Data layer — `src/lib/data/productions.ts`

- `Production` interface gains `costumes_due_date: string | null`.
- Persist via the existing production update path used by `PATCH
  /api/productions/[id]` (read the file: extend the existing `updateProduction`
  /title/notes/active setter, or add a focused `setCostumesDue(orgId, id, date)`
  mirroring the existing setters). Validate the date is a `YYYY-MM-DD` string or
  null; blank → null.

## API — `PATCH /api/productions/[id]`

Accept `costumesDueDate?: string | null` in the body and persist it. Follows the
route's existing auth + `assertProductionInOrg` pattern. Keep existing PATCH
fields (title/notes/active) working.

## Set control — `EditableProductionHeader`

Add a **"Costumes due"** `type="date"` input in the editor (alongside the title /
showings / active toggle), saved on change like the other fields, via the
production PATCH. Pre-filled from the production's `costumes_due_date`.

## Countdown + outstanding roll-up

A small pure helper `worklistProgress(worklist)` in `src/lib/tailor-summary.ts`
(or alongside it): `{ total, made, outstanding }` where `total` = all to-make
items, `made` = items with `made === true`, `outstanding = total - made`. Derived
from the same `buildMakeWorklist` output, so counts always match the worklist.

Display (a small shared presentational piece, e.g. `CostumesDueSummary`):
- **Countdown:** reuse `countdown(costumes_due_date, today)` → e.g. "Costumes due
  in 12 days" / "Due today" / "N days overdue" / nothing when no date set. Tone
  styling consistent with the existing countdown usage.
- **Roll-up:** "M of T costumes made" + "N still to make" (omit / show "all done"
  when outstanding is 0; handle T = 0 gracefully — nothing to make yet).

Placement:
- **Tailor's summary page** (`summary/page.tsx` → `TailorSummary`): at the top.
  It already builds the worklist; pass `costumesDueDate` + the progress in.
- **Production detail page** (`productions/[id]/page.tsx`): in the header area.
  It already loads roles/designs/castings/performers/casts/pieces, so it can call
  `buildMakeWorklist(...)` + `worklistProgress(...)` for the roll-up, and pass
  `costumes_due_date` to the summary display. The detail-page roll-up links to the
  Tailor's summary.

## Testing

- `src/lib/tailor-summary.test.ts` — `worklistProgress`: total/made/outstanding
  across a worklist with some made / none / empty.
- `src/lib/data/productions.test.ts` (+ update test) — `costumes_due_date`
  persisted on the update path.
- `src/app/api/productions/[id]/route.test.ts` — PATCH forwards `costumesDueDate`.
- `EditableProductionHeader`, the summary/detail display, `CostumesDueSummary` —
  tsc/lint/manual.

## Affected / New Files

- New: `supabase/migrations/0016_costumes_due_date.sql`
- New: `src/components/CostumesDueSummary.tsx` (countdown + roll-up display)
- Modified: `src/lib/data/productions.ts` (+ tests) — `costumes_due_date` + setter
- Modified: `src/lib/tailor-summary.ts` (+ test) — `worklistProgress`
- Modified: `src/app/api/productions/[id]/route.ts` (+ test) — accept `costumesDueDate`
- Modified: `src/components/EditableProductionHeader.tsx` — due-date input
- Modified: `src/components/TailorSummary.tsx` + `src/app/productions/[id]/summary/page.tsx` — show summary at top
- Modified: `src/app/productions/[id]/page.tsx` — compute roll-up + show summary in header

## Out of Scope

- Email/SMS reminders, cron, recipients (3c).
- Auto-deriving the due date from a tech-rehearsal showing.
- Per-maker outstanding breakdowns.
