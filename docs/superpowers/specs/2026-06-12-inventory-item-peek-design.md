# Inventory item peek popup (from the costume piece) — design

**Date:** 2026-06-12
**Status:** Approved for planning

## Problem

On the Costume tab, an inventory-linked piece's title bar shows a `From inventory ↗` link
that **navigates** to `/inventory?item=ID` (the inventory list, scrolled to the item). To get
back to where you were assigning the piece takes at least two clicks (back, then re-expand).
For a quick reference check ("where is this item / what does it look like"), that's heavy.

## Goal

Clicking `From inventory ↗` opens the inventory item's detail in a **view-only popup** over
the costume panel. Closing it returns you exactly where you were — no navigation.

Out of scope: editing the item from the popup; changing the inventory page; migrations.

## Decisions (from brainstorming)

1. **View-only** popup (photos + fields, read-only) — a quick reference, not an editor.
2. **Keep an `Open in inventory ↗` link** inside the popup (to `/inventory?item=ID`, the
   existing deep link) as an escape hatch when you actually want to edit.
3. Mirror the existing `PhotoStrip` lightbox overlay style for consistency.

## Architecture

### 1. `GET /api/inventory/[itemId]` (new handler)

Add a `GET` to `src/app/api/inventory/[itemId]/route.ts` alongside the existing
PATCH/DELETE: `getAuthContext` → `getInventoryItem(orgId, itemId)` → `{ item }`.
`getInventoryItem` already throws `NotFoundError` (→ 404 via `errorResponse`) when the item
isn't in the caller's org, so it's org-scoped for free. No data-layer change.

### 2. `InventoryItemPeek` component — `src/components/InventoryItemPeek.tsx` (new, client)

Props: `{ itemId: string; onClose: () => void }`.

- On mount, `GET /api/inventory/${itemId}` (credentials include) → item state; shows a brief
  "Loading…" until it resolves, an error line on failure.
- Renders a **fixed-inset overlay**: a semi-opaque backdrop (`fixed inset-0 … bg-…/…`) plus a
  centered `surface` card (max width, scrollable), mirroring `PhotoStrip`'s lightbox.
- Card content:
  - Header row: item **name** (display font) + a `×` close button.
  - Read-only **`PhotoStrip`** — `endpoint={`/api/inventory/${itemId}/images`}` `max={6}`
    `readOnly`.
  - Read-only detail lines, each rendered only when present: `category · size · ×quantity`
    (compose from non-null parts), `Location: …`, and notes.
  - Footer: a small `Open in inventory ↗` `<Link href={`/inventory?item=${itemId}`}>`.
- Closes via the `×` button, a backdrop click (not when clicking inside the card), or the
  **Escape** key. All call `onClose`. (Add/remove a `keydown` listener in a mount effect;
  clean it up on unmount.)

### 3. Costume panel wiring — `src/components/RoleCostumePanel.tsx`

In the component that renders the design title bar, add a `peekItemId: string | null` state.
Replace the title-bar `<Link href={`/inventory?item=${d.inventory_item_id}`}>From inventory ↗</Link>`
with a `<button type="button" onClick={() => setPeekItemId(d.inventory_item_id)}>From inventory ↗</button>`
(same `link-muted shrink-0 whitespace-nowrap text-xs` styling). Render
`{peekItemId && <InventoryItemPeek itemId={peekItemId} onClose={() => setPeekItemId(null)} />}`
once (e.g. at the end of that component's tree). One popup at a time.

## Data flow

The panel already has `d.inventory_item_id`. The button opens the popup for that id; the
popup fetches the item (`GET /api/inventory/[itemId]`) and its images (via the existing
images endpoint that `PhotoStrip` self-fetches). Closing clears `peekItemId`. The
`Open in inventory ↗` link still uses the deep link built earlier (`/inventory?item=ID`
expands + scrolls to the item) for the edit path.

## Files

| File | Change |
|------|--------|
| `src/app/api/inventory/[itemId]/route.ts` | add `GET` (returns `{ item }`) |
| `src/app/api/inventory/[itemId]/route.test.ts` | test the GET |
| `src/components/InventoryItemPeek.tsx` | **new** — view-only overlay |
| `src/components/RoleCostumePanel.tsx` | title-bar link → button that opens the popup |

## Testing

- **TDD (`route.test.ts`):** `GET` returns `{ item }` (mocked `getInventoryItem`) with 200;
  propagates `NotFoundError` → 404. Follows the existing route-test mock pattern in that file.
- **No component tests** (repo convention). Verify the popup (open/close via ×/backdrop/Esc,
  photos + fields render, `Open in inventory ↗` works) via `tsc` + `lint` + authenticated
  browser.

## Risks / caveats

- The popup mounts over a complex panel; keep it self-contained (its own fetch + overlay) so
  it can't disturb panel state. One `peekItemId` ensures a single instance.
- Backdrop-click vs card-click: stop propagation on the card so clicking inside doesn't close.
- The `Open in inventory ↗` link does navigate (by design, the edit escape hatch); the default
  interaction (open → look → close) stays in place.
