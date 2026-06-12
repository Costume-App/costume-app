# Purchase price for bought pieces — design

**Date:** 2026-06-12
**Status:** Approved (brainstorming → ready for implementation plan)

## Goal

Capture a price for `purchase`-source costume pieces and fold the purchased
total into the Costume Creations cost summary. Today only make-piece **fabric**
cost is summed (`buildFabricPurchaseList.totalCost`); purchased items carry no
price anywhere.

## Decisions (from brainstorming)

- **Granularity:** price is **per piece (per performer)**, stored on
  `costume_pieces` — mirrors how `fabric_yardage` / `fabric_unit_cost` already
  work. Same bought item can cost differently per performer, or only some buy it.
- **Storage:** a **new `purchase_price` column**, not a reuse of
  `fabric_unit_cost` (that field means "cost per yard" — wrong semantics for a
  flat purchase price).
- **Summary presentation:** keep the fabric shopping list as-is, add a separate
  **"Purchased items"** section, then a **grand total** (fabric + purchased).
- **Price entry:** editable in **two** places — the new summary section **and**
  next to the "Purchased" checkbox on the Costume tab (`RoleCostumePanel`). Both
  save through the existing pieces `PUT` API.

## Data model

- Migration `0023_purchase_price.sql`:
  `alter table costume_pieces add column purchase_price numeric;`
- Add `purchase_price: number | null` to:
  - `CostumePiece` (`src/lib/data/costume-pieces.ts`)
  - `PieceRow` (`src/lib/tailor-summary.ts`)
- `upsertPieceSource`: accept `purchasePrice`, coerce with the existing `num()`
  helper, persist in the upsert payload.
- `pieceRowIsEmpty`: **no change** — it only treats `source === "make"` rows as
  deletable, and a `purchase` row always persists. (A purchase row with only a
  price is therefore never dropped.)
- Pieces `PUT` route (`src/app/api/productions/[id]/pieces/route.ts`): accept
  `purchasePrice`, validate `≥ 0` via the existing `checkNum` helper, pass to
  `upsertPieceSource`.

## Rollup logic — `src/lib/tailor-summary.ts`

New pure function, parallel to `buildMakeWorklist`:

```
buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces)
  -> { items: PurchasedItem[], totalCost: number }
```

- Iterates `costume_pieces` rows with `source === "purchase"` (purchase is always
  explicit — never a lazy default).
- Each `PurchasedItem`: `designId, castingId, designName, performerName,
  castName, roleName, price: number | null, purchased: boolean` (`purchased` =
  the `made` flag).
- `totalCost` = sum of `price`, treating `null` as `0`.
- Ignores any maker filter (purchase pieces have no maker).

Grand total is computed in the component:
`fabricPurchase.totalCost + purchasedWorklist.totalCost`.

## UI

### Costume Creations summary tab (`TailorSummary.tsx` + new `PurchasedList.tsx`)

- Rename the **"Fabric list"** tab to **"Shopping"** (it now covers fabric *and*
  bought items).
- In that tab, below `FabricPurchaseList`, render a new **Purchased items**
  section (`PurchasedList` client component):
  - One row per `PurchasedItem`: `Design — Performer (Cast)` + an editable
    `$ price` input.
  - Empty price = empty input, counts as $0.
  - On blur, PUT to the pieces API with `purchasePrice`; update local `pieces`
    state via the existing `applySaved` callback so both tabs stay live.
- A **grand total** line at the bottom of the tab:
  `Total (fabric + purchased): $X`.
- The Purchased section **and** grand total render only when `!filterMakerId`
  (the full view), so the per-maker My Work view is unaffected.

### Costume tab (`RoleCostumePanel.tsx`)

- Next to the existing "Purchased" checkbox (the `source === "purchase"` branch),
  add a small `$ price` input.
- Saves on blur through `setPieceField`, which already preserves every other
  field. Extend its `patch` type with `purchasePrice?: number | null` and thread
  `purchase_price` through the PUT body (preserve `existing?.purchase_price` when
  toggling made/maker, like the other fabric fields).

## Testing (Vitest, TDD)

- `src/lib/tailor-summary.test.ts`:
  - `buildPurchaseWorklist` includes only `purchase`-source pieces.
  - Sums prices; a `null` price contributes 0.
  - Maps performer / cast / role / design names correctly.
- `src/app/api/productions/[id]/pieces/route.test.ts`:
  - PUT persists `purchasePrice`.
  - PUT rejects a negative `purchasePrice` with a validation error.

## Out of scope

- No per-design default purchase price (granularity is per piece).
- No change to the make worklist, fabric estimation, or inventory linkage.
