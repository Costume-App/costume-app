# Purchase Price for Bought Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a per-piece purchase price for `purchase`-source costume pieces and fold the purchased total into the Costume Creations cost summary.

**Architecture:** Add a `purchase_price` column to `costume_pieces`, thread it through the data layer and pieces `PUT` API, add a pure `buildPurchaseWorklist` rollup in `tailor-summary.ts`, then expose editable price inputs in two places (the renamed "Shopping" summary tab via a new `PurchasedList` component, and next to the "Purchased" checkbox on the Costume tab).

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (Postgres, `supabaseAdmin` service role), Vitest, Tailwind CSS 4.

---

## File Structure

- `supabase/migrations/0023_purchase_price.sql` — **Create.** Add the column.
- `src/lib/data/costume-pieces.ts` — **Modify.** Add `purchase_price` to `CostumePiece`; accept & persist `purchasePrice` in `upsertPieceSource`.
- `src/app/api/productions/[id]/pieces/route.ts` — **Modify.** Accept, validate (`≥ 0`), forward `purchasePrice`.
- `src/lib/tailor-summary.ts` — **Modify.** Add `purchase_price` to `PieceRow`; add `PurchasedItem`, `PurchasedList` types and `buildPurchaseWorklist`.
- `src/components/PurchasedList.tsx` — **Create.** Client component: editable price rows + section subtotal.
- `src/components/TailorSummary.tsx` — **Modify.** Rename tab to "Shopping", render `PurchasedList` + grand total in the full view.
- `src/components/RoleCostumePanel.tsx` — **Modify.** Add `$ price` input next to the Purchased checkbox; thread `purchasePrice` through `setPieceField`.
- Tests: `src/lib/tailor-summary.test.ts`, `src/app/api/productions/[id]/pieces/route.test.ts` — **Modify.**

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0023_purchase_price.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Purchase-source pieces now carry a flat per-piece price, summed into the
-- Costume Creations cost total alongside make-piece fabric cost. Distinct from
-- fabric_unit_cost (which is cost *per yard*).
alter table costume_pieces add column purchase_price numeric;
```

- [ ] **Step 2: Apply the migration to the shared Supabase project**

Run: `cat supabase/migrations/0023_purchase_price.sql` and apply it via the project's normal migration path (the same way 0022 was applied — Supabase SQL editor / CLI for this single shared project). Confirm the column exists:
Expected: `costume_pieces` now has a nullable `purchase_price numeric` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0023_purchase_price.sql
git commit -m "feat: add purchase_price column to costume_pieces"
```

---

## Task 2: Data layer — `CostumePiece` type + `upsertPieceSource`

**Files:**
- Modify: `src/lib/data/costume-pieces.ts`

- [ ] **Step 1: Add `purchase_price` to the `CostumePiece` interface**

In `src/lib/data/costume-pieces.ts`, add the field after `fabric_unit_cost` (line ~18):

```ts
  fabric_unit_cost: number | null;
  purchase_price: number | null;
  made: boolean;
```

- [ ] **Step 2: Accept `purchasePrice` in the `upsertPieceSource` input type**

In the `input:` object type (after `fabricUnitCost?: number | null;`, line ~76):

```ts
  fabricUnitCost?: number | null;
  purchasePrice?: number | null;
  made?: boolean;
```

- [ ] **Step 3: Coerce and persist it**

After the `const fabricUnitCost = num(input.fabricUnitCost);` line (~90), add:

```ts
  const fabricUnitCost = num(input.fabricUnitCost);
  const purchasePrice = num(input.purchasePrice);
```

Then in the `.upsert({ ... })` payload, after `fabric_unit_cost: fabricUnitCost,` (~140):

```ts
        fabric_unit_cost: fabricUnitCost,
        purchase_price: purchasePrice,
        made,
```

Note: `pieceRowIsEmpty` is intentionally NOT changed — it only deletes `source === "make"` rows, and a `purchase` row always persists.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). Some consumers update in later tasks; this file alone should compile.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-pieces.ts
git commit -m "feat: persist purchase_price in upsertPieceSource"
```

---

## Task 3: Pieces `PUT` API — accept and validate `purchasePrice`

**Files:**
- Modify: `src/app/api/productions/[id]/pieces/route.ts`
- Test: `src/app/api/productions/[id]/pieces/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/api/productions/[id]/pieces/route.test.ts`, add two tests at the end of the file:

```ts
test("PUT forwards purchasePrice", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "purchase" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "purchase", purchasePrice: 45 }),
    ctx("p1"),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ source: "purchase", purchasePrice: 45 }),
  );
});

test("PUT 400 on negative purchasePrice", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "purchase", purchasePrice: -5 }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/productions/\[id\]/pieces/route.test.ts`
Expected: FAIL — "PUT forwards purchasePrice" gets `purchasePrice: undefined`; "negative" returns 200 instead of 400.

- [ ] **Step 3: Implement in the route**

In `src/app/api/productions/[id]/pieces/route.ts`:

Add to the body type (after `fabricUnitCost?: number | null;`, ~41):

```ts
      fabricUnitCost?: number | null;
      purchasePrice?: number | null;
      made?: boolean;
```

Add a validation call after `checkNum(body.fabricUnitCost, "Unit cost");` (~58):

```ts
    checkNum(body.fabricUnitCost, "Unit cost");
    checkNum(body.purchasePrice, "Purchase price");
```

Forward it in the `upsertPieceSource({ ... })` call, after `fabricUnitCost: body.fabricUnitCost ?? null,` (~86):

```ts
      fabricUnitCost: body.fabricUnitCost ?? null,
      purchasePrice: body.purchasePrice ?? null,
      made: body.made ?? false,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/productions/\[id\]/pieces/route.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/pieces/route.ts" "src/app/api/productions/[id]/pieces/route.test.ts"
git commit -m "feat: accept and validate purchasePrice in pieces PUT"
```

---

## Task 4: Rollup logic — `buildPurchaseWorklist`

**Files:**
- Modify: `src/lib/tailor-summary.ts`
- Test: `src/lib/tailor-summary.test.ts`

- [ ] **Step 1: Add `purchase_price` to `PieceRow` and update the test helper**

In `src/lib/tailor-summary.ts`, in the `PieceRow` interface, after `fabric_unit_cost: number | null;` (~13):

```ts
  fabric_unit_cost: number | null;
  purchase_price: number | null;
  made: boolean;
```

In `src/lib/tailor-summary.test.ts`, the `row()` helper builds a full `PieceRow`; add the field after `fabric_unit_cost: null,` (~65):

```ts
    fabric_unit_cost: null,
    purchase_price: null,
    made: false,
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/tailor-summary.test.ts`, add `buildPurchaseWorklist` to the imports at the top:

```ts
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  buildPurchaseWorklist,
  buildMeasurementsByCasting,
  type PieceRow,
} from "@/lib/tailor-summary";
```

Add these tests at the end of the file:

```ts
test("buildPurchaseWorklist: includes only purchase pieces, sums prices", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "purchase", purchase_price: 45 }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "purchase", purchase_price: 20, made: true }),
    row({ costume_design_id: "d1", casting_id: "c2", source: "make", purchase_price: 999 }), // not purchase
    row({ costume_design_id: "d3", casting_id: "c3", source: "on_hand" }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  expect(pl.totalCost).toBe(65);
  expect(pl.items.map((i) => i.designName)).toEqual(["Cloak", "Hat"]);
  const cloak = pl.items.find((i) => i.designName === "Cloak")!;
  expect(cloak).toMatchObject({
    performerName: "Ada",
    castName: "Cast A",
    roleName: "Wizard",
    price: 45,
    purchased: false,
  });
  expect(pl.items.find((i) => i.designName === "Hat")!.purchased).toBe(true);
});

test("buildPurchaseWorklist: a null price contributes 0", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "purchase", purchase_price: null }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "purchase", purchase_price: 30 }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  expect(pl.totalCost).toBe(30);
  expect(pl.items.find((i) => i.designName === "Cloak")!.price).toBeNull();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `buildPurchaseWorklist` is not exported / not a function.

- [ ] **Step 4: Implement `buildPurchaseWorklist`**

In `src/lib/tailor-summary.ts`, add the types near the other exported interfaces (e.g. after `PurchaseList`, ~84):

```ts
export interface PurchasedItem {
  designId: string;
  castingId: string;
  designName: string;
  performerName: string;
  castName: string;
  roleName: string;
  price: number | null;
  purchased: boolean;
}

export interface PurchasedList {
  items: PurchasedItem[];
  totalCost: number;
}
```

Add the function (after `buildMakeWorklist`, before `buildFabricPurchaseList`, ~212). It reuses the same `RoleLike` / `DesignLike` / `CastingLike` / `PerformerLike` / `CastLike` params as `buildMakeWorklist`:

```ts
// Gather every purchase-source piece into a flat priced list. Purchase is always
// an explicit source (never a lazy default), so absence of a row contributes
// nothing here. Ordered by role, then design display order, then casting order.
export function buildPurchaseWorklist(
  roles: RoleLike[],
  designs: DesignLike[],
  castings: CastingLike[],
  performers: PerformerLike[],
  casts: CastLike[],
  pieces: PieceRow[],
): PurchasedList {
  const pieceMap = new Map<string, PieceRow>();
  for (const p of pieces) pieceMap.set(pieceKey(p.casting_id, p.costume_design_id), p);
  const performerName = new Map(performers.map((p) => [p.id, p.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));

  const items: PurchasedItem[] = [];
  let totalCost = 0;

  for (const role of roles) {
    const roleDesigns = designs
      .filter((d) => d.role_id === role.id)
      .sort((a, b) => a.display_order - b.display_order);
    const roleCastings = castings.filter((c) => c.role_id === role.id);

    for (const design of roleDesigns) {
      for (const casting of roleCastings) {
        const row = pieceMap.get(pieceKey(casting.id, design.id));
        if (row?.source !== "purchase") continue;
        const price = row.purchase_price;
        items.push({
          designId: design.id,
          castingId: casting.id,
          designName: design.name,
          performerName: performerName.get(casting.performer_id) ?? "—",
          castName: castName.get(casting.cast_id) ?? "—",
          roleName: role.name,
          price,
          purchased: row.made,
        });
        totalCost += price ?? 0;
      }
    }
  }

  return { items, totalCost };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat: buildPurchaseWorklist rollup for purchased pieces"
```

---

## Task 5: `PurchasedList` component (summary section, editable prices)

**Files:**
- Create: `src/components/PurchasedList.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/PurchasedList.tsx`. It renders one editable price row per purchased item and saves on blur through the pieces `PUT` API, then calls `onSaved` so the parent updates local state. The `PieceRow` it passes back is reconstructed from the API response.

```tsx
"use client";

import { useState } from "react";
import type { PurchasedItem, PieceRow } from "@/lib/tailor-summary";

function money(n: number): string {
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}

function PriceRow({
  productionId,
  item,
  onSaved,
}: {
  productionId: string;
  item: PurchasedItem;
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  const [value, setValue] = useState(item.price != null ? String(item.price) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) return; // ignore bad input
    if ((item.price ?? null) === next) return; // unchanged
    setBusy(true);
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        designId: item.designId,
        castingId: item.castingId,
        source: "purchase",
        sharedWithCastingId: null,
        made: item.purchased,
        purchasePrice: next,
      }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: PieceRow | null };
      onSaved(item.designId, item.castingId, piece);
    }
    setBusy(false);
  }

  return (
    <tr className="border-t border-[var(--field-line)]">
      <td className="py-1.5">{item.designName}</td>
      <td className="py-1.5">
        {item.performerName} · {item.castName}
      </td>
      <td className="py-1.5 pr-2 text-right">
        <label className="inline-flex items-center gap-1">
          <span className="muted">$</span>
          <input
            className="field !p-1.5 w-20 text-right text-sm"
            value={value}
            disabled={busy}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void save()}
            aria-label={`Price for ${item.designName} (${item.performerName})`}
          />
        </label>
      </td>
    </tr>
  );
}

export function PurchasedList({
  productionId,
  items,
  totalCost,
  onSaved,
}: {
  productionId: string;
  items: PurchasedItem[];
  totalCost: number;
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="lbl">Purchased items ({items.length})</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left muted">
            <th className="pb-1 font-normal">Piece</th>
            <th className="pb-1 font-normal">Who</th>
            <th className="pb-1 pr-2 text-right font-normal">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <PriceRow
              key={`${it.designId}:${it.castingId}`}
              productionId={productionId}
              item={it}
              onSaved={onSaved}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--ink)] font-semibold">
            <td className="py-1.5" colSpan={2}>
              Purchased subtotal
            </td>
            <td className="py-1.5 pr-2 text-right">{money(totalCost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/PurchasedList.tsx
git commit -m "feat: PurchasedList component with editable per-piece prices"
```

---

## Task 6: Wire `PurchasedList` + grand total into `TailorSummary`

**Files:**
- Modify: `src/components/TailorSummary.tsx`

- [ ] **Step 1: Import the new pieces**

In `src/components/TailorSummary.tsx`, update the imports:

```ts
import { FabricPurchaseList } from "@/components/FabricPurchaseList";
import { PurchasedList } from "@/components/PurchasedList";
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  buildPurchaseWorklist,
  type PieceRow,
  type MeasurementView,
} from "@/lib/tailor-summary";
```

- [ ] **Step 2: Compute the purchased worklist and grand total**

After the `purchase = useMemo(...)` block (~94), add:

```ts
  const purchased = useMemo(
    () => buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces),
    [roles, designs, castings, performers, casts, pieces],
  );
  const grandTotal = purchase.totalCost + purchased.totalCost;
```

- [ ] **Step 3: Rename the tab to "Shopping"**

In the `Tabs` `tabs={[...]}` array (~121), change the fabric tab label:

```ts
          { id: "fabric", label: "Shopping" },
```

- [ ] **Step 4: Render the purchased section + grand total**

In the `fabric` tab branch, replace `<FabricPurchaseList purchase={purchase} />` (~153) with:

```tsx
          <FabricPurchaseList purchase={purchase} />
          {!filterMakerId && (
            <PurchasedList
              productionId={productionId}
              items={purchased.items}
              totalCost={purchased.totalCost}
              onSaved={applySaved}
            />
          )}
          {!filterMakerId && (purchase.totalCost > 0 || purchased.totalCost > 0) && (
            <div className="flex justify-between border-t-2 border-[var(--ink)] pt-2 font-semibold">
              <span>Total (fabric + purchased)</span>
              <span>${grandTotal.toFixed(2)}</span>
            </div>
          )}
```

- [ ] **Step 5: Typecheck + run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TailorSummary.tsx
git commit -m "feat: show purchased items + grand total in Shopping tab"
```

---

## Task 7: Price input on the Costume tab (`RoleCostumePanel`)

**Files:**
- Modify: `src/components/RoleCostumePanel.tsx`

- [ ] **Step 1: Thread `purchasePrice` through `setPieceField`**

In `src/components/RoleCostumePanel.tsx`, widen the `patch` param type (~209):

```ts
    patch: { makerId?: string | null; made?: boolean; purchasePrice?: number | null },
```

In the `body: JSON.stringify({ ... })` of `setPieceField` (~220), add fields preserving existing values. After `fabricUnitCost: existing?.fabric_unit_cost ?? null,` (~230):

```ts
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        purchasePrice:
          patch.purchasePrice !== undefined ? patch.purchasePrice : existing?.purchase_price ?? null,
```

(The `made` / `makerId` lines below it stay as they are.)

- [ ] **Step 2: Add the price input next to the Purchased checkbox**

In the `source === "purchase"` branch (~411), add a price input after the existing `<label>…Purchased…</label>`, inside the same wrapping `<div className="flex ...">`. Use a small inline controlled input that saves on blur:

```tsx
                      {source === "purchase" && (
                        <>
                          <label className="inline-flex shrink-0 items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={piece?.made ?? false}
                              disabled={busy}
                              onChange={(e) => {
                                setPieceField(d.id, casting.id, { made: e.target.checked });
                                if (e.target.checked && !piece?.added_inventory_item_id) {
                                  setJustCompleted((m) => ({ ...m, [key]: true }));
                                }
                              }}
                              className="h-4 w-4 accent-[var(--red)]"
                              aria-label="Purchased"
                            />
                            <span className="muted text-xs">Purchased</span>
                          </label>
                          <PurchasePriceInput
                            key={`price:${piece?.purchase_price ?? ""}`}
                            initial={piece?.purchase_price ?? null}
                            busy={busy}
                            onSave={(price) => setPieceField(d.id, casting.id, { purchasePrice: price })}
                          />
                        </>
                      )}
```

- [ ] **Step 3: Add the `PurchasePriceInput` helper component**

At the bottom of `src/components/RoleCostumePanel.tsx` (alongside the other helper components like `MakeAssignment`), add:

```tsx
function PurchasePriceInput({
  initial,
  busy,
  onSave,
}: {
  initial: number | null;
  busy: boolean;
  onSave: (price: number | null) => void;
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  return (
    <label className="inline-flex shrink-0 items-center gap-1 text-sm">
      <span className="muted text-xs">$</span>
      <input
        className="field !p-1.5 w-20 text-right text-sm"
        value={value}
        disabled={busy}
        inputMode="decimal"
        placeholder="Price"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const trimmed = value.trim();
          const next = trimmed === "" ? null : Number(trimmed);
          if (next != null && (!Number.isFinite(next) || next < 0)) return;
          if ((initial ?? null) === next) return;
          onSave(next);
        }}
        aria-label="Purchase price"
      />
    </label>
  );
}
```

Verify `useState` is already imported in this file (it is — used elsewhere). Confirm with: `grep -n "useState" src/components/RoleCostumePanel.tsx | head -1`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npx next lint --file src/components/RoleCostumePanel.tsx` (or `npm run lint`)
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/RoleCostumePanel.tsx
git commit -m "feat: purchase price input on the Costume tab"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole test suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, no failures.

- [ ] **Step 2: Manual smoke test (dev server)**

Run: `npm run dev`, then in the app:
1. On a production's **Costume** tab, set a piece's source to **Purchase**, type a price in the `$` box, blur. Reload — the price persists.
2. Open **Costume Creations → Shopping** tab. The purchased item appears under "Purchased items" with its price; editing the price there saves and updates the subtotal.
3. The **Total (fabric + purchased)** line equals fabric total + purchased subtotal.
4. A purchase piece with no price shows an empty input and contributes $0.

Expected: all four behaviors hold.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: purchase price feature cleanup" --allow-empty
```

---

## Notes for the implementer

- This is the single shared Supabase project (no separate prod DB yet at migration time). Apply 0023 the same way 0022 was applied.
- Do **not** push or deploy — local commits only until Chris gives an explicit green light.
- The codebase uses no money-formatting util; `$${n.toFixed(2)}` inline (as in `FabricPurchaseList`) is the established pattern — reuse it, don't introduce a helper module.
- `credentials: "include"` is required on all client fetches (Clerk cookie auth).
