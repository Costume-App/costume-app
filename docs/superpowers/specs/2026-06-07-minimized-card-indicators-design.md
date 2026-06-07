# Minimized Role-Card Indicators — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Part of:** the workspace redesign. Final remaining piece besides photo upload.

## Problem

A collapsed role card shows only the role name + primary cast member. Users want at-a-glance status without expanding: whether the role has notes, how far along measurements are, and whether costume pieces exist.

## Goal

On a **collapsed** role card row, left of the primary cast-member name, show:
1. **Note icon** — when the role has notes. (Photos will also feed this once that feature exists; notes-only for now.)
2. **Measurement circle** — the per-performer dot, aggregated for the role across the selected cast's assigned performers: **complete** (full) if all are complete, **none** (empty) if none measured or no one cast, **partial** (half) otherwise. Always shown.
3. **Pieces icon** — a **clothes hanger** — when the role has any costume pieces (designs) defined.

Collapsed row: `▸ Mary Poppins        [note] [◑] [hanger]  Jane Banks   ✎ ×`. Indicators appear only when collapsed.

## Components / changes

### `src/components/MeasurementDot.tsx` (new — extracted)

Move the existing `MeasurementDot` out of `RoleCastPanel` into its own exported component (takes `status: MeasureStatus`). `RoleCastPanel` imports it instead of defining it locally — same markup, no behavior change. Reused by the role-aggregate indicator.

### `src/lib/measurement-aggregate.ts` (new, pure + tested)

`aggregateMeasureStatus(statuses: MeasureStatus[]): MeasureStatus` — `none` for empty or all-none; `complete` if all complete; else `partial`.

### `RoleCard.tsx`

In the collapsed summary cluster (the `{!open && ...}` block), before the name:
- Compute `hasNotes = !!role.notes && role.notes.trim().length > 0`.
- Compute assigned performers = `castings` filtered to `selectedCastId` + `role.id`; map to `measurementStatus[performerId] ?? "none"`; `aggregateMeasureStatus(...)`.
- Compute `hasPieces = designs.some((d) => d.role_id === role.id)`.
- Render: `{hasNotes && <NoteIcon/>}`, `<MeasurementDot status={agg} />`, `{hasPieces && <HangerIcon/>}`, then the existing `summary` (primary name). All inside the (non-interactive) toggle button; muted styling.
- Add local `NoteIcon` and `HangerIcon` SVGs (monochrome, `currentColor` stroke, ~13px, matching the existing `PencilIcon` style — no emoji).

`RoleCard` already receives `role`, `castings`, `selectedCastId`, `performers` (not needed for the dot), `measurementStatus`, and `designs` — all the inputs are present.

## Error handling / edge cases

- No one cast in the role → aggregate `none` (empty circle).
- Empty/whitespace notes → no note icon.
- Indicators never shown when expanded (the real data is visible there).

## Testing

- `aggregateMeasureStatus` unit tests: empty→none; all complete→complete; all none→none; mixed→partial; single partial→partial.
- Extraction of `MeasurementDot` is covered by existing behavior (no logic change); the indicators are manual-smoke.

## Migration / demo dependency

None.
