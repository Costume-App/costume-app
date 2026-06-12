# Add a costume piece to House Inventory — design

**Date:** 2026-06-12
**Status:** Approved for planning
**Related:** reverse of the existing "Add from inventory" link ([[roadmap-nada-feedback-2026-06-10]] item #4); House Inventory module, AI fabric estimator.

## Problem

When the team finishes making (or buys) a costume piece, there's no way to log it into the
org's **House Inventory** for reuse next season. Today inventory only flows one way — you can
pull an existing item *into* a costume ("Add from inventory"), but a freshly made/purchased
piece can't be pushed *out* to the library.

## Goal

Let a finished/bought costume piece be added to House Inventory, both:
1. **Manually**, from each performer's piece on the Costume tab, and
2. **Prompted**, when a piece is ticked **made** or **purchased** — a small inline question
   offers to add it.

## Decisions (from brainstorming)

1. **Unit = per performer's garment.** Each costume piece (one performer × one design) becomes
   its own inventory item named **`<design> (<performer>)`** — e.g. "Cloak (Ana)".
2. **Applies to `make` and `purchase` pieces** (the ones you make/buy). Not `on_hand`/`shared`.
3. **Photos copy over** — the design's reference photos are duplicated onto the new item.
4. **Manual control lives on each performer's piece** in the Costume tab's per-performer source
   area (`RoleCostumePanel`).
5. **Completion prompt is inline & transition-driven** — appears only right after you toggle a
   piece complete (this session), never on page load; dismissible; suppressed once the piece is
   already in inventory.

### Out of scope

- Merging multiples into one item with a quantity (always one item per performer's piece).
- A persistent "declined" flag (the prompt is transition-only, so it doesn't need one).
- Editing the inventory item inline from the prompt (it lands in House Inventory with sensible
  defaults; edit it there).
- Pushing `on_hand`/`shared` pieces to inventory.

## Architecture

### 1. Data model — migration `0022_piece_inventory_link.sql`

```sql
alter table costume_pieces
  add column added_inventory_item_id uuid references inventory_items (id) on delete set null;
```

Records the inventory item created from a piece. Drives two things: the manual control shows
"✓ In House Inventory" instead of the add button once set, and the add is **idempotent**
(re-adding a piece that already has a link returns the existing item — never a duplicate).

### 2. Storage helper — `copyImage` in `src/lib/storage.ts`

```ts
export async function copyImage(fromPath: string, toPath: string): Promise<void>
```
Wraps `supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).copy(fromPath, toPath)`. Both design and
inventory images live in the same `role-images` bucket (designs at `${prod}/designs/${id}/…`,
inventory at `inventory/${itemId}/…`), so this is an intra-bucket copy.

### 3. Data layer — `addPieceToInventory` (in `src/lib/data/inventory-items.ts` or a focused new file)

```ts
addPieceToInventory(orgId, productionId, designId, castingId)
  : Promise<{ item: InventoryItem; addedInventoryItemId: string }>
```
Steps:
- Load the piece row for `(designId, castingId)`. If none exists yet (a lazy `make` default that
  was never saved), create one with `source: "make"` so the link has somewhere to live. If the
  row already has `added_inventory_item_id`, load and return that item (idempotent; no-op).
- Load the design (name, notes) and the performer (label) to build the item name
  `"<design.name> (<performer.label>)"`.
- `createInventoryItem(orgId, { name, notes: design.notes, quantity: 1 })`.
- Copy photos: `listCostumeDesignImages(designId)` → for each, `copyImage(img.storage_path,
  "inventory/<itemId>/<randomUUID>.jpg")` then `addInventoryItemImage(itemId, newPath)`. A
  photoless design simply yields an item with no photos.
- Set the piece's `added_inventory_item_id = item.id`.
- Return `{ item, addedInventoryItemId: item.id }`.

Org-scoping/IDOR is enforced by the route (below) before this runs.

### 4. Route — `POST /api/productions/[id]/pieces/to-inventory`

- Body `{ designId: string; castingId: string }`.
- `getAuthContext` → `assertProductionInOrg(orgId, id)` → `assertCastingInProduction(id, castingId)`
  and confirm the design belongs to the production. Any **member** may add (it's normal work,
  not an org setting).
- Calls `addPieceToInventory(...)`; returns `{ item, addedInventoryItemId }`.
- TDD'd, mirroring the existing pieces routes' auth/validation shape.

### 5. UI — one shared `AddToInventoryControl`

A small client component encapsulating the manual button, the inline prompt, and the
busy/added states, so the behaviour lives in one place. Props (sketch):
`{ productionId, designId, castingId, pieceLabel, addedItemId, show?: "button" | "prompt", onAdded }`.

- **Button mode** — renders `+ to House Inventory`; once `addedItemId` is set, renders
  `✓ In House Inventory ↗` linking to `/inventory?item=<id>`. On click → POST → on success calls
  `onAdded(itemId)` (parent updates state) and flips to the linked state. Busy + error states.
- **Prompt mode** — renders the inline question *"Add `<pieceLabel>` to House Inventory?"* with
  **[Add]** / **[Not now]**. **[Add]** → same POST + `onAdded`. **[Not now]** → hides it
  (local state).

Placement:
- **Costume tab (`RoleCostumePanel`)** — in each performer's piece row (make/purchase only):
  the button mode. It also renders the **prompt** when that piece transitions to made/purchased
  this session (the panel already owns made via `MakeAssignment` and purchased via the Purchased
  checkbox). `RoleCostumePanel` has the full `CostumePiece`, so `added_inventory_item_id` is
  available directly.
- **Costume Creations / My Work (`MakePieceRow`)** — the **prompt** only (the manual button lives
  in the Costume tab). It appears when the row is toggled **made** this session, for make pieces.
  `added_inventory_item_id` is threaded onto `PieceRow`/`MakeItem` so an already-added piece
  doesn't re-prompt.

### 6. State threading

`added_inventory_item_id` is added to the `CostumePiece` type (already loaded in
`RoleCostumePanel`) and to `PieceRow` + `MakeItem` (so the worklist surfaces know it). After a
successful add, the relevant local state is updated (`setPieces`/`onSaved`-style) so the prompt
clears and the button flips to the linked state without a reload.

## Data flow

Tick made/purchased (or click the manual button) → POST `…/pieces/to-inventory {designId,
castingId}` → server creates the inventory item, copies the design's photos, links the piece →
returns the item → the UI marks the piece "in House Inventory" and the new item appears in
House Inventory. Re-adding the same piece returns the existing item (idempotent).

## Testing

TDD:
- **Route** (`to-inventory/route.test.ts`): mock `addPieceToInventory`; assert it's called with
  `(orgId, productionId, designId, castingId)`, returns `{ item, addedInventoryItemId }`, 404s
  off-org (NotFoundError via `assertProductionInOrg`), and 400s on a missing `designId`/`castingId`.
- **Data layer** (`addPieceToInventory`): creates an item named `"<design> (<performer>)"` with
  the design's notes; copies each design image (asserts `copyImage` + `addInventoryItemImage`
  calls); sets the piece link; and is **idempotent** (a piece with an existing link returns that
  item and creates nothing new). Mock the Supabase chain + storage like the existing data tests.
- UI verified manually (button + prompt on both surfaces; idempotent re-add; photoless piece).
- Verify `tsc` + `lint` + `vitest`; existing tests unaffected. Migration `0022` must be applied
  to the shared Supabase project before the feature works (additive — older code unaffected).

## Risks / caveats

- **Reference vs real photos** — the copied photos are the design's *reference/inspiration*
  images, which may not match the finished garment; the user can swap them in House Inventory.
- **Idempotency, not multiplicity** — a piece links to exactly one item; you can't add the same
  performer's piece twice. (Deliberate — prevents accidental duplicates.) Removing the item
  nulls the link (FK on delete set null), so it can be re-added afterward.
- **Migration 0022 unapplied = feature errors** — same operational note as 0021; Chris applies it.
- **Prompt is transition-only** — if you tick a piece made, dismiss the prompt, and reload, the
  prompt won't reappear; use the Costume-tab manual button to add later. Accepted.
