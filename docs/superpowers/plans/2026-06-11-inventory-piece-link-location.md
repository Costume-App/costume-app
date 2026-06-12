# Inventory-linked Piece: Title-bar Link + Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For inventory-linked costume designs, show a deep-linking "From inventory ↗" in the piece title bar and the item's location next to each performer's source dropdown.

**Architecture:** Enrich `listCostumeDesigns` with an `inventory_location` derived field (one batched lookup), which flows to the costume panel via both the initial page load and the designs refetch. The panel renders the title-bar link (→ `/inventory?item=<id>`) and the per-row location. The inventory page reads `?item=` and tells `InventoryManager` to expand + scroll to that item.

**Tech Stack:** Next.js 16 App Router, Supabase (`supabaseAdmin`), TypeScript strict, Vitest, React.

---

## File Structure

| File | Change |
|------|--------|
| `src/lib/data/costume-designs.ts` | `CostumeDesign.inventory_location?`; enrich in `listCostumeDesigns` |
| `src/lib/data/costume-designs.test.ts` | mock `.in()` + enrichment test |
| `src/components/InventoryManager.tsx` | `focusItemId` prop: row anchors + expand/scroll on mount |
| `src/app/(app)/inventory/page.tsx` | read `searchParams.item` → `focusItemId` |
| `src/components/RoleCostumePanel.tsx` | title-bar deep-link; drop expanded link; per-row location |

---

## Task 1: Enrich `listCostumeDesigns` with the linked item's location (TDD)

**Files:**
- Modify: `src/lib/data/costume-designs.ts`, `src/lib/data/costume-designs.test.ts`

- [ ] **Step 1: Update the test mock + add the failing test**

In `src/lib/data/costume-designs.test.ts`:

(1a) Add an `.in()` mock. After the line `const select = vi.fn(() => ({ eq: listEq }));` add:
```ts
const invIn = vi.fn();
```

(1b) In `beforeEach`, add `invIn` to the reset array (append it to the `.forEach` list), and change the line `select.mockReturnValue({ eq: listEq });` to:
```ts
  select.mockReturnValue({ eq: listEq, in: invIn });
```

(1c) Add this test (after the existing `listCostumeDesigns returns rows for a production` test):
```ts
test("listCostumeDesigns attaches inventory_location to linked designs only", async () => {
  order2.mockResolvedValue({
    data: [
      { id: "d1", inventory_item_id: null },
      { id: "d2", inventory_item_id: "i1" },
    ],
    error: null,
  });
  invIn.mockResolvedValue({ data: [{ id: "i1", location: "Bin A" }], error: null });

  const rows = await listCostumeDesigns("p1");

  expect(invIn).toHaveBeenCalledWith("id", ["i1"]);
  expect(rows).toEqual([
    { id: "d1", inventory_item_id: null },
    { id: "d2", inventory_item_id: "i1", inventory_location: "Bin A" },
  ]);
});

test("listCostumeDesigns skips the inventory lookup when nothing is linked", async () => {
  order2.mockResolvedValue({ data: [{ id: "d1", inventory_item_id: null }], error: null });
  const rows = await listCostumeDesigns("p1");
  expect(invIn).not.toHaveBeenCalled();
  expect(rows).toEqual([{ id: "d1", inventory_item_id: null }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/data/costume-designs.test.ts`
Expected: FAIL — `inventory_location` not attached / `invIn` not called.

- [ ] **Step 3: Implement**

(3a) In `src/lib/data/costume-designs.ts`, add the derived field to the interface:
```ts
export interface CostumeDesign {
  id: string;
  production_id: string;
  role_id: string;
  name: string;
  notes: string | null;
  inventory_item_id: string | null;
  inventory_location?: string | null;
  display_order: number;
  created_at: string;
}
```

(3b) Replace the body of `listCostumeDesigns` with:
```ts
export async function listCostumeDesigns(productionId: string): Promise<CostumeDesign[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const designs = (data ?? []) as CostumeDesign[];

  const itemIds = [...new Set(designs.map((d) => d.inventory_item_id).filter(Boolean))] as string[];
  if (itemIds.length === 0) return designs;

  const { data: items, error: itemErr } = await supabaseAdmin
    .from("inventory_items")
    .select("id, location")
    .in("id", itemIds);
  if (itemErr) throw new Error(itemErr.message);
  const locById = new Map(
    ((items ?? []) as { id: string; location: string | null }[]).map((i) => [i.id, i.location]),
  );
  return designs.map((d) =>
    d.inventory_item_id ? { ...d, inventory_location: locById.get(d.inventory_item_id) ?? null } : d,
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/data/costume-designs.test.ts`
Expected: PASS (existing tests + the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-designs.ts src/lib/data/costume-designs.test.ts
git commit -m "feat: enrich listCostumeDesigns with linked inventory_location"
```

---

## Task 2: `InventoryManager` focus-by-id (expand + scroll)

**Files:**
- Modify: `src/components/InventoryManager.tsx`

- [ ] **Step 1: Add the `useEffect` import**

Change `import { useMemo, useState } from "react";` to:
```ts
import { useEffect, useMemo, useState } from "react";
```

- [ ] **Step 2: Add the `focusItemId` prop**

Change the component signature:
```tsx
export function InventoryManager({ initialItems }: { initialItems: InventoryRow[] }) {
```
to:
```tsx
export function InventoryManager({
  initialItems,
  focusItemId,
}: {
  initialItems: InventoryRow[];
  focusItemId?: string;
}) {
```

- [ ] **Step 3: Add the focus effect**

Immediately after the line `const categories = useMemo(() => uniqueCategories(items), [items]);` add:
```tsx
  useEffect(() => {
    if (!focusItemId || !items.some((i) => i.id === focusItemId)) return;
    setExpandedId(focusItemId);
    document.getElementById(`inv-item-${focusItemId}`)?.scrollIntoView({ block: "center" });
    // run once on mount for the deep-linked item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Add a DOM anchor to each item row**

Find the item row list element `<li key={item.id}>` and change it to:
```tsx
                  <li key={item.id} id={`inv-item-${item.id}`}>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm run lint` → no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/InventoryManager.tsx
git commit -m "feat: InventoryManager focusItemId — expand + scroll to a deep-linked item"
```

---

## Task 3: Inventory page forwards `?item=` to the manager

**Files:**
- Modify: `src/app/(app)/inventory/page.tsx`

- [ ] **Step 1: Read searchParams and pass focusItemId**

Replace:
```tsx
export default async function InventoryPage() {
  const { orgId } = await getAuthContext();
  const items = await listInventoryItems(orgId);
```
with:
```tsx
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { item: focusItemId } = await searchParams;
  const items = await listInventoryItems(orgId);
```

Then change the `<InventoryManager` opening tag to pass the prop:
```tsx
      <InventoryManager
        focusItemId={focusItemId}
        initialItems={items.map((i) => ({
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm run lint` → no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/inventory/page.tsx"
git commit -m "feat: inventory page forwards ?item to focus a deep-linked item"
```

---

## Task 4: Costume panel — title-bar link + per-row location

**Files:**
- Modify: `src/components/RoleCostumePanel.tsx`

(`Link` is already imported in this file.)

- [ ] **Step 1: Add the title-bar deep-link**

In the design header row (the non-renaming branch), insert the link between the expand `</button>` and the rename `<button>`. Replace:
```tsx
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${d.name}`}
```
with:
```tsx
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                </button>
                {d.inventory_item_id && (
                  <Link
                    href={`/inventory?item=${d.inventory_item_id}`}
                    className="link-muted shrink-0 whitespace-nowrap text-xs"
                  >
                    From inventory ↗
                  </Link>
                )}
                <button
                  type="button"
                  aria-label={`Rename ${d.name}`}
```

- [ ] **Step 2: Remove the old link from the expanded section**

Replace:
```tsx
            {d.inventory_item_id ? (
              <>
                <PhotoStrip
                  endpoint={`/api/inventory/${d.inventory_item_id}/images`}
                  max={6}
                  readOnly
                />
                <Link href="/inventory" className="link-muted inline-block text-xs">
                  From inventory ↗
                </Link>
              </>
            ) : (
```
with:
```tsx
            {d.inventory_item_id ? (
              <PhotoStrip
                endpoint={`/api/inventory/${d.inventory_item_id}/images`}
                max={6}
                readOnly
              />
            ) : (
```

- [ ] **Step 3: Add the per-row location next to the source dropdown**

In the per-casting piece row, after the shared-picker `<select>` conditional, before the row's closing `</div>`. Replace:
```tsx
                        </select>
                      )}
                    </div>
                    {source === "make" && (
```
with:
```tsx
                        </select>
                      )}
                      {d.inventory_item_id && d.inventory_location && (
                        <span className="shrink-0 whitespace-nowrap text-xs muted">
                          {d.inventory_location}
                        </span>
                      )}
                    </div>
                    {source === "make" && (
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean (`d.inventory_location` resolves via the updated `CostumeDesign` type). Run: `npm run lint` → no new errors. Run: `npx vitest run` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/RoleCostumePanel.tsx
git commit -m "feat: piece title-bar inventory deep-link + per-performer location"
```

---

## Task 5: Verification

**Files:** none (Clerk-gated; interactive checks need an authenticated browser). Dev server: http://localhost:3000.

- [ ] **Step 1: Static checks** — `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npx vitest run` (green).

- [ ] **Step 2: Browser** — on a role's Costume tab with a piece added from inventory:
  - The design's title bar shows `From inventory ↗`; the expanded section no longer shows that link (photo strip remains).
  - Each performer's row for that piece shows the item's location next to the source dropdown (when a location was entered), regardless of whether the dropdown is On hand or Make.
  - Clicking `From inventory ↗` lands on `/inventory` with that exact item expanded and scrolled into view.
  - A design with no location shows no location text; a non-inventory design shows neither the link nor a location.

---

## Self-Review Notes

- **Spec coverage:** title-bar link (T4 S1) + remove expanded link (T4 S2) + deep-link (T2/T3/T4) + per-row location (T4 S3) + data enrichment (T1). ✓
- **Type consistency:** `CostumeDesign.inventory_location?` defined in T1, consumed in T4; `focusItemId` prop defined in T2, passed in T3; row anchor id `inv-item-<id>` matches between T2 Step 3 (scroll target) and Step 4 (the `<li>` id). ✓
- **No-extra-query guard** (T1) keeps non-inventory productions at one query; verified by the second new test.
- **Deep-link robustness:** the focus effect no-ops if the item isn't in the loaded list (deleted item) — graceful.
