# Inventory Module — Design

**Date:** 2026-06-11
**Status:** Approved (brainstorm), spec pending user review
**Roadmap item:** #4 (Inventory / costume library) from Nada's feedback backlog

## Background

Nada's troupe keeps a photographed inventory of on-hand costume items and props, and
wants to pull existing items into a production's costume pieces ("Add from inventory")
rather than re-describing them each show. This is roadmap item #4 of the Nada feedback
backlog (after #1 piece photos, #2 maker assignment, #3a/#3b deadlines — all shipped
locally).

The app today models costumes as:
- **`costume_designs`** — named pieces per role (production_id + role_id + name + notes +
  display_order), with reference photos in **`costume_design_images`**.
- **`costume_pieces`** — per-performer (casting) sourcing of a design: `source`
  (`make` | `on_hand` | `shared`), fabric details, maker, made status. Created lazily.

Org-level shared entities already exist: **`makers`** (migration 0013) + the `/makers`
management page, linked from the productions list. The inventory module mirrors that
shape closely.

## Goals

1. An org-level, photographed inventory library reusable across all productions.
2. "Add from inventory" onto a role's costume pieces, creating a **live-linked** piece.
3. The library shows where each item is currently used ("Used in: …").

## Non-goals (YAGNI)

- Availability / check-out enforcement or reservations (quantity is informational only).
- Double-booking warnings against quantity on hand.
- Barcode/QR, CSV import/export, cross-org sharing.
- Labeled front/back photo slots (we reuse the generic multi-photo `PhotoStrip`).

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Item fields | name + photos + **category, size, quantity, location, notes** |
| Add-from-inventory relationship | **Live link** (piece references the item; library shows usage) |
| Availability tracking | **No** — quantity is informational, no blocking |
| Photos | **Reuse `PhotoStrip`** (up to 6 generic photos, phone camera); first = thumbnail |
| Scope | **Org-level** (shared across all productions), not per-production |

## Data model

A single migration **0018** creates both inventory tables and adds the link column to
`costume_designs`.

`inventory_items` (mirrors `makers`):

```sql
create table if not exists inventory_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  name       text not null,
  category   text,
  size       text,
  quantity   integer not null default 1,
  location   text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_items_org_id_idx on inventory_items(org_id);
```

`inventory_item_images` (mirrors `costume_design_images`):

```sql
create table if not exists inventory_item_images (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);
create index if not exists inventory_item_images_item_id_idx
  on inventory_item_images(inventory_item_id);
```

Photos live in the existing **`role-images`** Storage bucket under an
`inventory/${itemId}/…` path prefix (no new bucket), reusing the generic
`uploadImage` / `signImageUrls` / `removeImages` helpers in `src/lib/storage.ts`.

### The link (same migration 0018)

```sql
alter table costume_designs
  add column if not exists inventory_item_id uuid
    references inventory_items(id) on delete set null;
create index if not exists costume_designs_inventory_item_id_idx
  on costume_designs(inventory_item_id);
```

`on delete set null`: deleting a library item leaves existing pieces intact — they
become plain pieces, keeping their name and notes.

## Behavior

### "Add from inventory"

- In the role **Costume tab**, alongside "add a piece," an **"Add from inventory"**
  control opens a searchable/filterable picker (by name + category) of the org's items.
- Picking an item creates a `costume_design` on that role with `inventory_item_id` set
  and `name` defaulted from the item (still renameable inline, as today).

### Linked-piece rendering

- A linked piece renders the **inventory item's photos by reference** (read-only) instead
  of its own `costume_design_images`, and shows a small **"From inventory"** tag that links
  back to the item.
- Piece **notes stay piece-local** (production-specific, e.g. "hem taken up for Sarah") —
  separate from the item's own notes.
- When a performer's `costume_piece` row is first created for a linked design, its
  **`source` defaults to `on_hand`** (instead of `make`).

### Library usage display

- `listInventoryUsage(itemId)` returns the linked designs joined to role + production
  names, rendered as "Used in: <Production> → <Role>" on each item card.

## Data layer + API

Mirrors `makers` and the design-image modules.

- `src/lib/data/inventory-items.ts`
  - `listInventoryItems(orgId)`
  - `createInventoryItem(orgId, input)` — validates non-empty name, quantity ≥ 0
  - `updateInventoryItem(orgId, id, patch)`
  - `deleteInventoryItem(orgId, id)`
  - `listInventoryUsage(itemId)` → `{ productionId, productionName, roleId, roleName, designId, designName }[]`
- `src/lib/data/inventory-item-images.ts` — mirrors `costume-design-images.ts`
  (`listImages`, `addImage`, `removeImage`, count helpers as needed).

API routes under `src/app/api/inventory/…` (CRUD + image upload/delete), each validating
Clerk `userId` + org first, then querying Supabase, returning JSON — same shape as
`/api/makers` and the design-image routes. The "add from inventory" action reuses the
existing costume-design create path with an `inventoryItemId` argument (extend
`createCostumeDesign`).

## UI surfaces

### `/inventory` page

- Top-level page, linked from the productions list next to the existing **Makers** link.
- Atelier-themed grid of item cards: thumbnail (first photo), name, category, size,
  quantity, location, notes, `PhotoStrip` photo management, inline edit/delete, and a
  "Used in: …" list.
- "Add item" via the established expand-from-link rare-action pattern.
- New component `InventoryManager.tsx` (mirrors `MakersManager.tsx`).

### Role Costume tab

- **Add-from-inventory picker** added to `RoleCostumePanel` (searchable list, filter by
  category).
- **Linked-piece rendering** in the piece card: reference photos + "From inventory" tag.

## Testing (Vitest, TDD)

Following the repo's existing `*.test.ts` mock patterns:

- `inventory-items.test.ts` — CRUD, name validation, quantity validation, usage query.
- `inventory-item-images.test.ts` — mirrors `costume-design-images.test.ts`.
- `costume-designs.test.ts` — extend for the `inventoryItemId` create path.
- Link default-source logic (`on_hand` for linked designs) where that logic lives.
- On-delete-set-null behavior is enforced by the FK (covered at the data-layer/integration
  level per existing convention).

## Build order

1. Migration 0018 (inventory tables + link column).
2. Data layer + tests (`inventory-items`, `inventory-item-images`), extend `costume-designs`.
3. API routes.
4. `/inventory` page + `InventoryManager` + productions-list link.
5. Add-from-inventory picker + linked-piece rendering in the Costume tab.
