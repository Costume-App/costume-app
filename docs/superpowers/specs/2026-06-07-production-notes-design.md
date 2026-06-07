# Production Notes On Detail Page — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Problem

The `productions.notes` column exists but is never surfaced. Users want a free-text notes area on the production detail page to jot production-wide notes.

## Goal

A minimizable notes textarea on the detail page, below the Showings list and above the casts (`ProductionWorkspace`). Collapsed by default when empty, auto-expanded when notes exist, auto-saves on blur.

## Non-goals

- No rich text / formatting — plain textarea.
- No per-cast or per-role notes — this is one production-level field.

## Components / changes

### Data layer — `src/lib/data/productions.ts`

`setProductionNotes(orgId, id, notes: string)` — mirrors `setProductionActive`:
- `.update({ notes: notes || null }).eq("id", id).eq("org_id", orgId).select().maybeSingle()`.
- `notes || null` clears an empty box to null; non-empty content (including newlines) is stored verbatim.
- Throw `NotFoundError("Production not found")` if no row; return the row.

### API — `src/app/api/productions/[id]/route.ts`

Extend the existing `PATCH` handler with a `notes` branch. After the `isActive` branch and before the `title` fallback:
```typescript
    if (typeof body.notes === "string") {
      const production = await setProductionNotes(orgId, id, body.notes);
      return NextResponse.json({ production });
    }
```
Update the body type to `{ title?: string; isActive?: boolean; notes?: string }` and import `setProductionNotes`. The `isActive`/`title` branches are unchanged. (Each UI action sends exactly one field, so branch order is unambiguous.)

### UI — `src/components/ProductionNotes.tsx` (new client component)

Props `{ productionId: string; notes: string | null }`. State:
- `open` — initial `!!notes` (expanded when notes already exist).
- `value` — initial `notes ?? ""` (textarea content).
- `busy`, `saved` (boolean), `error` (string | null).
- `lastSaved` ref — initial `notes ?? ""`, used to skip no-op saves.

Behavior:
- **Collapsed:** a quiet toggle button — `▸ Production notes` — that sets `open = true`.
- **Expanded:** a header row with `▾ Production notes` (collapses) and a small status (`Saving…` / `Saved` / the error in red); a `<textarea className="field w-full" rows={4}>` bound to `value`.
- `onChange`: update `value`, clear `saved`.
- `onBlur` → `save()`: if `value === lastSaved.current`, return; else `PATCH /api/productions/${productionId}` with `{ notes: value }`, `credentials: "include"`. On success set `lastSaved.current = value`, `saved = true`; on failure set `error`. No `router.refresh()` (nothing else renders notes; keeps the textarea stable).

Uses existing classes: `.field`, `.link-muted`, `.lbl`/`.muted`, `.text-[var(--red)]`.

### Detail page — `src/app/productions/[id]/page.tsx`

Render `<ProductionNotes productionId={id} notes={production.notes} />` between the Showings block and `<ProductionWorkspace>` (e.g. wrapped in a `mb-6` div). Import the component. `production.notes` is already available (the interface has `notes: string | null`, `getProduction` selects `*`).

## Error handling

- Save failure → inline error; `busy` reset; value retained for retry.
- Cross-org / missing → 404 via `assertProductionInOrg` / `NotFoundError`.

## Testing

- `setProductionNotes`: updates notes scoped by id+org (value + empty→null); `NotFoundError` when no row.
- `PATCH …/[id]`: `notes` body → 200, calls `setProductionNotes(orgId, id, notes)`; existing title/isActive tests still pass.
- UI: no automated tests (consistent with the codebase); manual smoke — collapsed when empty, expanded when notes exist, type + blur saves, reload persists.

## Migration / demo dependency

None — `notes` column already exists.
