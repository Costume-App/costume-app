# Edit Showings In Place — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Builds on:** showing times (`2026-06-07-showing-times-and-edit-ux`), merged.

## Problem

A showing's date/time can only be removed and re-added — there's no way to edit one in place. Users want to adjust a showing's date or time directly.

## Goal

In the edit dialog, each existing showing is inline-editable: a pre-filled date field and time field. Changing either saves immediately. Remove still deletes.

## Non-goals

- No duplicate guard on edits (only the Add row guards). An accidental duplicate is harmless and removable.
- No batch/save-all; each field saves on change.

## Components / changes

### Data layer — `src/lib/data/show-dates.ts`

`updateShowDate(productionId, id, patch)` where `patch: { show_date?: string; show_time?: string | null }`:
- Build an update object from whichever fields are present.
- If `show_date` is provided: trim; `ValidationError("Show date is required")` if empty.
- If `show_time` is provided: store `show_time || null`.
- `.update(update).eq("id", id).eq("production_id", productionId).select().maybeSingle()`; throw `NotFoundError("Showing not found")` if no row; return the row. (Mirrors `updateProduction`.)

### API — `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`

Add a `PATCH` handler to the existing file (keeps DELETE):
- Body `{ date?: string; time?: string }`.
- Build `patch`: if `typeof body.date === "string"` → `patch.show_date = body.date`; if `typeof body.time === "string"` → `patch.show_time = body.time`.
- `getAuthContext` → `assertProductionInOrg(orgId, id)` → `updateShowDate(id, dateId, patch)` → `{ showDate }`; `errorResponse` on catch.

### Edit dialog — `src/components/EditableProductionHeader.tsx`

Replace each read-only showing row (currently date+time text + Remove) with an editable row matching the Add row layout (`flex flex-wrap items-center gap-2`):
- **Date field:** `<input type="date" className="field min-w-0 flex-1" defaultValue={d.show_date} onChange={…}>` — on change, if the value is non-empty, `PATCH { date: value }`.
- **Time field:** `<input type="time" className="field w-32 shrink-0" defaultValue={(d.show_time ?? "").slice(0,5)} aria-label="Showing time" onChange={…}>` — on change, `PATCH { time: value }` (empty clears it).
- **Remove** button unchanged.

Fields are **uncontrolled** (`defaultValue`, keyed by `d.id`) so a picked value doesn't snap back during the save round-trip, and a post-save `router.refresh()` (which may re-sort the list) doesn't reset them.

New helper in the component, e.g. `saveShowing(dateId, patch)` → uses the existing in-flight-guarded `send()` to `PATCH /api/productions/${productionId}/show-dates/${dateId}` with the JSON patch, failure message "Couldn't save showing".

The Add row, name field, Make-inactive/past-guidance, and Done button are unchanged.

## Error handling

- Empty date on edit → `ValidationError` → 400, surfaced inline (existing `error` state). The date `onChange` guard skips empty values, so this is a backstop.
- Cross-org / missing showing → 404 via `assertProductionInOrg` / `NotFoundError`.

## Testing

- `updateShowDate`: updates `show_date` (and rejects empty with `ValidationError`); updates `show_time` (value + null when empty); `NotFoundError` when no row matches; scoping by id + production_id.
- `PATCH …/show-dates/[dateId]`: date-only update (200, calls `updateShowDate` with `{ show_date }`); time-only update (200, `{ show_time }`); 404 cross-org.
- UI: no automated tests (consistent with the codebase); manual smoke — edit a date, edit a time, clear a time.

## Migration / demo dependency

None — uses the existing `show_dates` table (`show_time` already added by 0008).
