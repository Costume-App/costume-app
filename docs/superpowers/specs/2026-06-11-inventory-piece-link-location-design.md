# Inventory-linked piece: title-bar link + location display — design

**Date:** 2026-06-11
**Status:** Approved for planning

## Problem

When a costume piece is added from inventory (the design gets an `inventory_item_id`), the
only inventory affordance is a small "From inventory ↗" link buried in the design's
*expanded* section, and it links to the bare `/inventory` list rather than the specific
item. There's also no quick indication, at the per-performer assignment level, of where the
item physically lives.

## Goal

For inventory-linked costume designs:
1. Surface the "From inventory ↗" link in the design's **title bar** (always visible), and
   make it deep-link to that specific item's detail in inventory.
2. Show the inventory item's **location** next to each performer's source dropdown.

Out of scope: a dedicated `/inventory/[id]` route, editing the item from the costume panel,
migrations.

## Decisions (from brainstorming)

- The location shows **whenever the design is inventory-linked** (has `inventory_item_id`)
  and a location was entered — **independent of the source dropdown value** (On hand, Make,
  etc.). If the linked item has no location, show nothing.
- "Detail" = deep-link to `/inventory?item=<id>`, which opens (expands + scrolls to) that
  item in the existing inventory list — there is no separate detail page.

## Architecture

### 1. Data layer — enrich designs with the linked item's location

`src/lib/data/costume-designs.ts`:
- Add `inventory_location?: string | null` to the `CostumeDesign` interface (a derived
  field, not a DB column).
- In `listCostumeDesigns(productionId)`: after fetching designs, collect the distinct
  non-null `inventory_item_id`s; if any, batch-fetch `inventory_items(id, location)` for
  them and attach `inventory_location` to each linked design. When no design is linked, skip
  the extra query and return designs unchanged.

This single point feeds both the initial production-page load and the panel's
`GET /api/productions/[id]/designs` refetch (both call `listCostumeDesigns`), so no route
signature changes. Other `listCostumeDesigns` consumers (tailor summary, etc.) simply ignore
the new optional field.

### 2. `RoleCostumePanel.tsx`

- **Title-bar link:** in the design header row (the one with the expand chevron, `d.name`,
  rename pencil, remove), when `d.inventory_item_id` is set, render a shrink-0
  `From inventory ↗` link → `/inventory?item=${d.inventory_item_id}` (styled
  `link-muted text-xs`). **Remove** the existing `From inventory ↗` `<Link>` from the
  expanded `renderExtra` section (the read-only inventory `PhotoStrip` stays).
- **Location by the dropdown:** in each per-casting piece row, when `d.inventory_item_id`
  is set and `d.inventory_location` is non-empty, render the location text (muted, e.g.
  `text-xs muted`) next to the source `<select>`.

### 3. `inventory/page.tsx`

Accept `searchParams` (Next.js 16: a Promise), read `item`, and pass it to
`InventoryManager` as `focusItemId={item}`.

### 4. `InventoryManager.tsx`

- New optional prop `focusItemId?: string`.
- Give each item row a stable DOM anchor (`id={`inv-item-${item.id}`}`).
- On mount, if `focusItemId` matches a loaded item: set it as the expanded row and
  `scrollIntoView` it (and ensure its category group isn't collapsed). No-op if the id
  isn't present (graceful).

## Data flow

`listCostumeDesigns` → (enriched designs incl. `inventory_location`) → production page →
`RoleCard` → `RoleCostumePanel`. Panel refetches via the designs GET route, which returns
the same enriched shape. The title-bar link navigates to `/inventory?item=<id>`; the
inventory server page forwards `item` → `InventoryManager` focuses it.

## Files

| File | Change |
|------|--------|
| `src/lib/data/costume-designs.ts` | `CostumeDesign.inventory_location?`; enrich in `listCostumeDesigns` |
| `src/lib/data/costume-designs.test.ts` | test the enrichment |
| `src/components/RoleCostumePanel.tsx` | title-bar link (deep-link) + per-row location; drop expanded link |
| `src/app/(app)/inventory/page.tsx` | read `searchParams.item` → `focusItemId` |
| `src/components/InventoryManager.tsx` | `focusItemId` prop: expand + scroll to the item |

## Testing

- **TDD (data layer):** `listCostumeDesigns` attaches `inventory_location` for linked
  designs (batched lookup), leaves unlinked designs untouched, and skips the extra query
  when nothing is linked — using the repo's `supabaseAdmin` mock pattern in
  `costume-designs.test.ts`.
- **UI:** no component tests in this repo — verify the title-bar link, the location text,
  and the inventory deep-link/scroll via `tsc` + `lint` + an authenticated browser.

## Risks / caveats

- `listCostumeDesigns` gains one extra (batched) query when linked designs exist. Negligible
  at this scale, and skipped when none are linked.
- The deep-link relies on the item being present in the loaded inventory list; if it was
  deleted, the page still loads (the focus is a graceful no-op).
- `useSearchParams`/dynamic concerns are avoided by reading `searchParams` server-side in the
  page and passing a prop, rather than reading it client-side in `InventoryManager`.
