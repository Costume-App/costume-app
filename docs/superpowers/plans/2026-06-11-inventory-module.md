# Inventory Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an org-level photographed inventory ("costume library") and let users pull existing items into a production's costume pieces via a live link.

**Architecture:** A new `inventory_items` table (mirrors `makers`) + `inventory_item_images` (mirrors `costume_design_images`), photos in the existing `role-images` bucket under an `inventory/` prefix. A nullable `costume_designs.inventory_item_id` FK (`on delete set null`) is the live link; a linked piece renders the item's photos read-only, defaults its source to `on_hand`, and the library shows where each item is used.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (service-role admin client), Clerk, Tailwind 4, Vitest. Follows the established `makers` / `costume-designs` / `costume-design-images` patterns exactly.

**Spec:** `docs/superpowers/specs/2026-06-11-inventory-module-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/0018_inventory.sql` — tables + link column
- `src/lib/data/inventory-items.ts` + `.test.ts` — item CRUD, ownership lookup, usage query
- `src/lib/data/inventory-item-images.ts` + `.test.ts` — image rows + first-image thumbnails
- `src/app/api/inventory/route.ts` + `.test.ts` — list (w/ thumbnails) + create
- `src/app/api/inventory/[itemId]/route.ts` + `.test.ts` — patch + delete (cleans storage)
- `src/app/api/inventory/[itemId]/images/route.ts` — list + upload
- `src/app/api/inventory/[itemId]/images/[imageId]/route.ts` — delete
- `src/app/api/inventory/[itemId]/usage/route.ts` — usage
- `src/app/inventory/page.tsx` — the `/inventory` page
- `src/components/InventoryManager.tsx` — the library UI
- `src/components/AddFromInventory.tsx` — the picker used in the Costume tab

**Modified:**
- `src/lib/data/costume-designs.ts` — `inventory_item_id` on the interface; optional `inventoryItemId` on create (+ `.test.ts`)
- `src/lib/costume-sources.ts` — `defaultSourceFor(design)` helper (+ `.test.ts`)
- `src/lib/tailor-summary.ts` — `DesignLike.inventory_item_id`; default absent source via `defaultSourceFor` (+ `.test.ts`)
- `src/app/api/productions/[id]/designs/route.ts` — POST accepts `inventoryItemId`
- `src/components/PhotoStrip.tsx` — `readOnly` prop
- `src/components/RoleCostumePanel.tsx` — add-from-inventory wiring + linked-piece rendering + inventory-aware default source
- `src/app/productions/[id]/page.tsx` + `src/app/productions/[id]/summary/page.tsx` + `src/components/TailorSummary.tsx` — thread `inventory_item_id` into the worklist
- `src/app/productions/page.tsx` — add an "Inventory" link

---

## Task 1: Migration 0018 — inventory tables + link column

**Files:**
- Create: `supabase/migrations/0018_inventory.sql`

> Migrations are applied **manually** in the Supabase dashboard SQL editor (see `README.md`). This task only authors the file. Chris applies it to the shared project — flag this as a manual checkpoint after the file is committed.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0018_inventory.sql`:

```sql
-- Org-level photographed inventory ("costume library") of on-hand items/props.
-- Reusable across productions; pulled into a role's pieces via the link column
-- added at the bottom. Mirrors makers (0013) + costume_design_images (0012).
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

-- Reference photos per inventory item. Objects live in the shared private
-- "role-images" bucket under an inventory/ path prefix; this table tracks paths.
create table if not exists inventory_item_images (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);
create index if not exists inventory_item_images_item_id_idx
  on inventory_item_images(inventory_item_id);

-- The live link: a costume piece pulled "from inventory". Deleting a library
-- item leaves existing pieces intact (they become plain on-hand pieces).
alter table costume_designs
  add column if not exists inventory_item_id uuid
    references inventory_items(id) on delete set null;
create index if not exists costume_designs_inventory_item_id_idx
  on costume_designs(inventory_item_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0018_inventory.sql
git commit -m "feat: migration 0018 — inventory tables + costume_designs link"
```

- [ ] **Step 3: Manual checkpoint** — Chris applies `0018_inventory.sql` in the Supabase SQL editor before the feature is exercised against the DB. (Unit tests below mock Supabase, so they don't need it.)

---

## Task 2: `inventory-items` data layer

**Files:**
- Create: `src/lib/data/inventory-items.ts`
- Test: `src/lib/data/inventory-items.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/inventory-items.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const listOrder = vi.fn();
const getMaybeSingle = vi.fn();
const secondEqGet = vi.fn(() => ({ maybeSingle: getMaybeSingle }));
const firstEq = vi.fn(() => ({ order: listOrder, eq: secondEqGet }));
const select = vi.fn(() => ({ eq: firstEq }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const updMaybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle: updMaybeSingle }));
const updEq2 = vi.fn(() => ({ select: updSelect }));
const updEq1 = vi.fn(() => ({ eq: updEq2 }));
const update = vi.fn(() => ({ eq: updEq1 }));
const delEq2 = vi.fn();
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select, insert, update, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryUsage,
} from "@/lib/data/inventory-items";

beforeEach(() => {
  [listOrder, getMaybeSingle, secondEqGet, firstEq, select, insertSingle, insertSelect, insert,
    updMaybeSingle, updSelect, updEq2, updEq1, update, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  secondEqGet.mockReturnValue({ maybeSingle: getMaybeSingle });
  firstEq.mockReturnValue({ order: listOrder, eq: secondEqGet });
  select.mockReturnValue({ eq: firstEq });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  updSelect.mockReturnValue({ maybeSingle: updMaybeSingle });
  updEq2.mockReturnValue({ select: updSelect });
  updEq1.mockReturnValue({ eq: updEq2 });
  update.mockReturnValue({ eq: updEq1 });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select, insert, update, delete: del });
});

test("listInventoryItems filters by org, oldest-first", async () => {
  listOrder.mockResolvedValue({ data: [{ id: "i1", org_id: "org_1", name: "Top hat" }], error: null });
  const rows = await listInventoryItems("org_1");
  expect(from).toHaveBeenCalledWith("inventory_items");
  expect(firstEq).toHaveBeenCalledWith("org_id", "org_1");
  expect(listOrder).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", org_id: "org_1", name: "Top hat" }]);
});

test("getInventoryItem returns the row scoped by id and org", async () => {
  getMaybeSingle.mockResolvedValue({ data: { id: "i1", name: "Top hat" }, error: null });
  const row = await getInventoryItem("org_1", "i1");
  expect(firstEq).toHaveBeenCalledWith("id", "i1");
  expect(secondEqGet).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "i1", name: "Top hat" });
});

test("getInventoryItem throws NotFoundError when missing", async () => {
  getMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(getInventoryItem("org_1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});

test("createInventoryItem trims fields and defaults quantity to 1", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i2", name: "Cape" }, error: null });
  await createInventoryItem("org_1", { name: "  Cape  ", category: " Outerwear " });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1",
    name: "Cape",
    category: "Outerwear",
    size: null,
    quantity: 1,
    location: null,
    notes: null,
  });
});

test("createInventoryItem keeps a provided non-negative quantity", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i3" }, error: null });
  await createInventoryItem("org_1", { name: "Glove", quantity: 6 });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1", name: "Glove", category: null, size: null, quantity: 6, location: null, notes: null,
  });
});

test("createInventoryItem rejects an empty name", async () => {
  await expect(createInventoryItem("org_1", { name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateInventoryItem patches only provided fields, scoped by id+org", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "i1", name: "Cape", quantity: 2 }, error: null });
  const row = await updateInventoryItem("org_1", "i1", { name: " Cape ", quantity: 2, location: "" });
  expect(update).toHaveBeenCalledWith({ name: "Cape", quantity: 2, location: null });
  expect(updEq1).toHaveBeenCalledWith("id", "i1");
  expect(updEq2).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "i1", name: "Cape", quantity: 2 });
});

test("updateInventoryItem rejects an empty name when name is provided", async () => {
  await expect(updateInventoryItem("org_1", "i1", { name: "   " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateInventoryItem throws NotFoundError when no row matches", async () => {
  updMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateInventoryItem("org_1", "nope", { notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteInventoryItem deletes by id scoped to the org", async () => {
  delEq2.mockResolvedValue({ error: null });
  await deleteInventoryItem("org_1", "i1");
  expect(delEq1).toHaveBeenCalledWith("id", "i1");
  expect(delEq2).toHaveBeenCalledWith("org_id", "org_1");
});

test("listInventoryUsage flattens production+role names per linked design", async () => {
  listOrder.mockResolvedValue({
    data: [
      { id: "d1", name: "Cloak", production_id: "p1", role_id: "r1",
        productions: { title: "Hamlet" }, roles: { name: "Ophelia" } },
    ],
    error: null,
  });
  const usage = await listInventoryUsage("i1");
  expect(from).toHaveBeenCalledWith("costume_designs");
  expect(firstEq).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(usage).toEqual([
    { designId: "d1", designName: "Cloak", productionId: "p1", productionName: "Hamlet", roleId: "r1", roleName: "Ophelia" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- inventory-items`
Expected: FAIL — `Cannot find module "@/lib/data/inventory-items"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/inventory-items.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface InventoryItem {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryUsage {
  designId: string;
  designName: string;
  productionId: string;
  productionName: string;
  roleId: string;
  roleName: string;
}

interface InventoryInput {
  name?: string;
  category?: string | null;
  size?: string | null;
  quantity?: number;
  location?: string | null;
  notes?: string | null;
}

const clean = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);
const cleanQuantity = (q: number | undefined): number =>
  typeof q === "number" && Number.isFinite(q) && q >= 0 ? Math.floor(q) : 1;

export async function listInventoryItems(orgId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryItem[];
}

export async function getInventoryItem(orgId: string, id: string): Promise<InventoryItem> {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Inventory item not found");
  return data as InventoryItem;
}

export async function createInventoryItem(orgId: string, input: InventoryInput): Promise<InventoryItem> {
  const name = (input.name ?? "").trim();
  if (!name) throw new ValidationError("Item name is required");
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .insert({
      org_id: orgId,
      name,
      category: clean(input.category),
      size: clean(input.size),
      quantity: cleanQuantity(input.quantity),
      location: clean(input.location),
      notes: clean(input.notes),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryItem;
}

export async function updateInventoryItem(
  orgId: string,
  id: string,
  patch: InventoryInput,
): Promise<InventoryItem> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Item name is required");
    update.name = trimmed;
  }
  if (patch.category !== undefined) update.category = clean(patch.category);
  if (patch.size !== undefined) update.size = clean(patch.size);
  if (patch.quantity !== undefined) update.quantity = cleanQuantity(patch.quantity);
  if (patch.location !== undefined) update.location = clean(patch.location);
  if (patch.notes !== undefined) update.notes = clean(patch.notes);
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Inventory item not found");
  return data as InventoryItem;
}

export async function deleteInventoryItem(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

interface UsageRow {
  id: string;
  name: string;
  production_id: string;
  role_id: string;
  productions: { title: string } | null;
  roles: { name: string } | null;
}

// Where a library item is currently pulled in: each linked costume_design with
// its production + role names. Spans all productions in the org.
export async function listInventoryUsage(itemId: string): Promise<InventoryUsage[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("id, name, production_id, role_id, productions(title), roles(name)")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as UsageRow[]).map((d) => ({
    designId: d.id,
    designName: d.name,
    productionId: d.production_id,
    productionName: d.productions?.title ?? "",
    roleId: d.role_id,
    roleName: d.roles?.name ?? "",
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- inventory-items`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/inventory-items.ts src/lib/data/inventory-items.test.ts
git commit -m "feat: inventory-items data layer (CRUD + ownership + usage)"
```

---

## Task 3: `inventory-item-images` data layer

**Files:**
- Create: `src/lib/data/inventory-item-images.ts`
- Test: `src/lib/data/inventory-item-images.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/inventory-item-images.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const listOrder = vi.fn();
const listEq = vi.fn(() => ({ order: listOrder }));
const countEq = vi.fn();
const inOrder = vi.fn();
const inIn = vi.fn(() => ({ order: inOrder }));
const select = vi.fn();
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delMaybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle: delMaybeSingle }));
const delEq2 = vi.fn(() => ({ select: delSelect }));
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listInventoryItemImages,
  countInventoryItemImages,
  addInventoryItemImage,
  deleteInventoryItemImage,
  firstImagePaths,
} from "@/lib/data/inventory-item-images";

beforeEach(() => {
  [listOrder, listEq, countEq, inOrder, inIn, select, insertSingle, insertSelect, insert,
    delMaybeSingle, delSelect, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  listEq.mockReturnValue({ order: listOrder });
  inIn.mockReturnValue({ order: inOrder });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle: delMaybeSingle });
  delEq2.mockReturnValue({ select: delSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listInventoryItemImages returns rows for an item, oldest-first", async () => {
  select.mockReturnValue({ eq: listEq });
  listOrder.mockResolvedValue({ data: [{ id: "im1", storage_path: "inventory/i1/a.jpg" }], error: null });
  const rows = await listInventoryItemImages("i1");
  expect(from).toHaveBeenCalledWith("inventory_item_images");
  expect(listEq).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(rows).toEqual([{ id: "im1", storage_path: "inventory/i1/a.jpg" }]);
});

test("countInventoryItemImages returns the count", async () => {
  countEq.mockResolvedValue({ count: 3, error: null });
  select.mockReturnValue({ eq: countEq });
  expect(await countInventoryItemImages("i1")).toBe(3);
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
});

test("addInventoryItemImage inserts the path", async () => {
  insertSingle.mockResolvedValue({ data: { id: "im2" }, error: null });
  await addInventoryItemImage("i1", "inventory/i1/b.jpg");
  expect(insert).toHaveBeenCalledWith({ inventory_item_id: "i1", storage_path: "inventory/i1/b.jpg" });
});

test("deleteInventoryItemImage returns the removed path", async () => {
  delMaybeSingle.mockResolvedValue({ data: { storage_path: "inventory/i1/b.jpg" }, error: null });
  const path = await deleteInventoryItemImage("i1", "im2");
  expect(delEq1).toHaveBeenCalledWith("id", "im2");
  expect(delEq2).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(path).toBe("inventory/i1/b.jpg");
});

test("deleteInventoryItemImage returns null when nothing matched", async () => {
  delMaybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteInventoryItemImage("i1", "nope")).toBeNull();
});

test("firstImagePaths maps each item to its earliest image path", async () => {
  select.mockReturnValue({ in: inIn });
  inOrder.mockResolvedValue({
    data: [
      { inventory_item_id: "i1", storage_path: "inventory/i1/a.jpg" },
      { inventory_item_id: "i1", storage_path: "inventory/i1/b.jpg" },
      { inventory_item_id: "i2", storage_path: "inventory/i2/c.jpg" },
    ],
    error: null,
  });
  const map = await firstImagePaths(["i1", "i2"]);
  expect(map).toEqual({ i1: "inventory/i1/a.jpg", i2: "inventory/i2/c.jpg" });
});

test("firstImagePaths short-circuits on empty input", async () => {
  expect(await firstImagePaths([])).toEqual({});
  expect(from).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- inventory-item-images`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/inventory-item-images.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface InventoryItemImage {
  id: string;
  inventory_item_id: string;
  storage_path: string;
  created_at: string;
}

export async function listInventoryItemImages(itemId: string): Promise<InventoryItemImage[]> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("*")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryItemImage[];
}

export async function countInventoryItemImages(itemId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addInventoryItemImage(itemId: string, storagePath: string): Promise<InventoryItemImage> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .insert({ inventory_item_id: itemId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryItemImage;
}

export async function deleteInventoryItemImage(itemId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .delete()
    .eq("id", id)
    .eq("inventory_item_id", itemId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InventoryItemImage | null)?.storage_path ?? null;
}

// Earliest image path per item, for library/picker thumbnails. Empty input → {}.
export async function firstImagePaths(itemIds: string[]): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("inventory_item_id, storage_path")
    .in("inventory_item_id", itemIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { inventory_item_id: string; storage_path: string }[]) {
    if (!(row.inventory_item_id in map)) map[row.inventory_item_id] = row.storage_path;
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- inventory-item-images`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/inventory-item-images.ts src/lib/data/inventory-item-images.test.ts
git commit -m "feat: inventory-item-images data layer (+ thumbnail helper)"
```

---

## Task 4: Link column on costume designs

**Files:**
- Modify: `src/lib/data/costume-designs.ts`
- Test: `src/lib/data/costume-designs.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/lib/data/costume-designs.test.ts`, add after the existing `createCostumeDesign` test:

```ts
test("createCostumeDesign includes inventory_item_id when linked", async () => {
  insertSingle.mockResolvedValue({ data: { id: "d2", name: "Cloak", inventory_item_id: "i1" }, error: null });
  await createCostumeDesign({ productionId: "p1", roleId: "r1", name: "Cloak", inventoryItemId: "i1" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", role_id: "r1", name: "Cloak", inventory_item_id: "i1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- costume-designs`
Expected: FAIL — `insert` called with object missing `inventory_item_id`.

- [ ] **Step 3: Update the implementation**

In `src/lib/data/costume-designs.ts`, add the field to the interface:

```ts
export interface CostumeDesign {
  id: string;
  production_id: string;
  role_id: string;
  name: string;
  notes: string | null;
  inventory_item_id: string | null;
  display_order: number;
  created_at: string;
}
```

Replace `createCostumeDesign` with:

```ts
export async function createCostumeDesign(input: {
  productionId: string;
  roleId: string;
  name: string;
  inventoryItemId?: string | null;
}): Promise<CostumeDesign> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Piece name is required");
  const row: Record<string, unknown> = {
    production_id: input.productionId,
    role_id: input.roleId,
    name,
  };
  if (input.inventoryItemId) row.inventory_item_id = input.inventoryItemId;
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesign;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- costume-designs`
Expected: PASS (existing tests still pass — the unlinked insert still omits `inventory_item_id` — plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-designs.ts src/lib/data/costume-designs.test.ts
git commit -m "feat: optional inventory_item_id link on costume designs"
```

---

## Task 5: Inventory-aware default source (`defaultSourceFor` + worklist)

**Files:**
- Modify: `src/lib/costume-sources.ts`
- Test: `src/lib/costume-sources.test.ts`
- Modify: `src/lib/tailor-summary.ts`
- Test: `src/lib/tailor-summary.test.ts`
- Modify: `src/app/productions/[id]/page.tsx`, `src/app/productions/[id]/summary/page.tsx`, `src/components/TailorSummary.tsx`

A linked piece is "on hand", so where no `costume_pieces` row exists the default source must be `on_hand` (not `make`) — otherwise linked pieces wrongly appear in the make worklist.

- [ ] **Step 1: Add the failing `defaultSourceFor` test**

In `src/lib/costume-sources.test.ts`, add:

```ts
import { defaultSourceFor } from "@/lib/costume-sources";

test("defaultSourceFor returns make for an unlinked design", () => {
  expect(defaultSourceFor({ inventory_item_id: null })).toBe("make");
});

test("defaultSourceFor returns on_hand for an inventory-linked design", () => {
  expect(defaultSourceFor({ inventory_item_id: "i1" })).toBe("on_hand");
});
```

(If `costume-sources.test.ts` does not exist, create it with the two tests above plus `import { expect, test } from "vitest";` at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- costume-sources`
Expected: FAIL — `defaultSourceFor` is not exported.

- [ ] **Step 3: Add `defaultSourceFor`**

In `src/lib/costume-sources.ts`, append:

```ts
// The lazy default source for a design when no costume_pieces row exists:
// inventory-linked pieces are on-hand; everything else defaults to make.
export function defaultSourceFor(design: { inventory_item_id?: string | null }): CostumeSource {
  return design.inventory_item_id ? "on_hand" : DEFAULT_SOURCE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- costume-sources`
Expected: PASS.

- [ ] **Step 5: Add the failing worklist test**

In `src/lib/tailor-summary.test.ts`, add a test (adapt the helper/shape to match the file's existing `buildMakeWorklist` test setup — designs in that file need the new `inventory_item_id` field):

```ts
test("buildMakeWorklist excludes inventory-linked designs with no piece row", () => {
  const roles = [{ id: "r1", name: "Ophelia", notes: null }];
  const designs = [
    { id: "d1", role_id: "r1", name: "Gown", display_order: 0, inventory_item_id: null },
    { id: "d2", role_id: "r1", name: "Cloak", display_order: 1, inventory_item_id: "i1" },
  ];
  const castings = [
    { id: "c1", cast_id: "ca1", role_id: "r1", performer_id: "p1", assignment: "primary" as const },
  ];
  const performers = [{ id: "p1", name: "Mia" }];
  const casts = [{ id: "ca1", name: "Cast A" }];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  const designIds = wl.roles.flatMap((r) => r.garments.map((g) => g.designId));
  expect(designIds).toEqual(["d1"]); // Cloak (linked) defaults to on_hand, so it's excluded
  expect(wl.totalItems).toBe(1);
});
```

Also update any existing `buildMakeWorklist` tests in this file: add `inventory_item_id: null` to each design literal they construct (the `DesignLike` type now requires it).

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tailor-summary`
Expected: FAIL — TS error (design literals missing `inventory_item_id`) and/or the new assertion fails because `d2` is treated as `make`.

- [ ] **Step 7: Update `buildMakeWorklist`**

In `src/lib/tailor-summary.ts`:

Add the import:

```ts
import { pieceKey } from "@/lib/costume-merge";
import { defaultSourceFor } from "@/lib/costume-sources";
```

Extend `DesignLike`:

```ts
interface DesignLike { id: string; role_id: string; name: string; display_order: number; inventory_item_id: string | null }
```

Replace the default-source line inside the casting loop:

```ts
        const row = pieceMap.get(pieceKey(casting.id, design.id));
        const source = row?.source ?? defaultSourceFor(design);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tailor-summary costume-sources`
Expected: PASS.

- [ ] **Step 9: Thread `inventory_item_id` through the three worklist call sites**

In `src/app/productions/[id]/page.tsx` (~line 73), add the field to the design map:

```ts
    designs.map((d) => ({ id: d.id, role_id: d.role_id, name: d.name, display_order: d.display_order, inventory_item_id: d.inventory_item_id })),
```

In `src/components/TailorSummary.tsx` (~line 17), extend the local `Design` interface:

```ts
interface Design { id: string; role_id: string; name: string; display_order: number; inventory_item_id: string | null }
```

In `src/app/productions/[id]/summary/page.tsx` (~line 72), add the field to the `designs` map passed to `<TailorSummary>`:

```ts
        designs={designs.map((d) => ({
          id: d.id,
          role_id: d.role_id,
          name: d.name,
          display_order: d.display_order,
          inventory_item_id: d.inventory_item_id,
        }))}
```

- [ ] **Step 10: Verify the whole suite + types**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/lib/costume-sources.ts src/lib/costume-sources.test.ts src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts "src/app/productions/[id]/page.tsx" "src/app/productions/[id]/summary/page.tsx" src/components/TailorSummary.tsx
git commit -m "feat: inventory-linked pieces default to on_hand in the worklist"
```

---

## Task 6: Inventory API routes

**Files:**
- Create: `src/app/api/inventory/route.ts` + `src/app/api/inventory/route.test.ts`
- Create: `src/app/api/inventory/[itemId]/route.ts` + `src/app/api/inventory/[itemId]/route.test.ts`
- Create: `src/app/api/inventory/[itemId]/images/route.ts`
- Create: `src/app/api/inventory/[itemId]/images/[imageId]/route.ts`
- Create: `src/app/api/inventory/[itemId]/usage/route.ts`
- Modify: `src/app/api/productions/[id]/designs/route.ts`

- [ ] **Step 1: Write the failing test for the collection route**

Create `src/app/api/inventory/route.test.ts` (mirrors `src/app/api/makers/route.test.ts` — open that file first to match its exact mock style for `getAuthContext`, `ensureOrganization`, and the data layer):

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: vi.fn(async () => {}) }));
vi.mock("@/lib/data/inventory-items", () => ({
  listInventoryItems: vi.fn(),
  createInventoryItem: vi.fn(),
}));
vi.mock("@/lib/data/inventory-item-images", () => ({ firstImagePaths: vi.fn(async () => ({})) }));
vi.mock("@/lib/storage", () => ({ signImageUrls: vi.fn(async () => ({})) }));

import { GET, POST } from "@/app/api/inventory/route";
import { listInventoryItems, createInventoryItem } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";

beforeEach(() => {
  vi.mocked(listInventoryItems).mockReset();
  vi.mocked(createInventoryItem).mockReset();
  vi.mocked(firstImagePaths).mockReset().mockResolvedValue({});
  vi.mocked(signImageUrls).mockReset().mockResolvedValue({});
});

test("GET returns items with signed thumbnail urls", async () => {
  vi.mocked(listInventoryItems).mockResolvedValue([
    { id: "i1", org_id: "org_1", name: "Hat", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "" },
  ]);
  vi.mocked(firstImagePaths).mockResolvedValue({ i1: "inventory/i1/a.jpg" });
  vi.mocked(signImageUrls).mockResolvedValue({ "inventory/i1/a.jpg": "https://signed/a" });
  const res = await GET();
  const body = await res.json();
  expect(body.items[0]).toMatchObject({ id: "i1", name: "Hat", thumbUrl: "https://signed/a" });
});

test("POST creates an item and returns 201", async () => {
  vi.mocked(createInventoryItem).mockResolvedValue({
    id: "i2", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x/api/inventory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cape" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(201);
  expect((await res.json()).item.id).toBe("i2");
  expect(createInventoryItem).toHaveBeenCalledWith("org_1", expect.objectContaining({ name: "Cape" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "api/inventory/route"`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the collection route**

Create `src/app/api/inventory/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { listInventoryItems, createInventoryItem } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const items = await listInventoryItems(orgId);
    const thumbs = await firstImagePaths(items.map((i) => i.id));
    const urls = await signImageUrls(Object.values(thumbs));
    return NextResponse.json({
      items: items.map((i) => ({
        ...i,
        thumbUrl: thumbs[i.id] ? urls[thumbs[i.id]] ?? null : null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    const body = (await request.json()) as {
      name?: string; category?: string; size?: string; quantity?: number;
      location?: string; notes?: string; orgName?: string;
    };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const item = await createInventoryItem(orgId, {
      name: body.name,
      category: body.category,
      size: body.size,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      location: body.location,
      notes: body.notes,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "api/inventory/route"`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the item route**

Create `src/app/api/inventory/[itemId]/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/inventory-items", () => ({
  getInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
}));
vi.mock("@/lib/data/inventory-item-images", () => ({ listInventoryItemImages: vi.fn(async () => []) }));
vi.mock("@/lib/storage", () => ({ removeImages: vi.fn(async () => {}) }));

import { PATCH, DELETE } from "@/app/api/inventory/[itemId]/route";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

const ctx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

beforeEach(() => {
  [getInventoryItem, updateInventoryItem, deleteInventoryItem, listInventoryItemImages, removeImages]
    .forEach((m) => vi.mocked(m as never).mockReset?.());
  vi.mocked(listInventoryItemImages).mockResolvedValue([]);
});

test("PATCH updates and returns the item", async () => {
  vi.mocked(updateInventoryItem).mockResolvedValue({
    id: "i1", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 2, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ quantity: 2 }) });
  const res = await PATCH(req, ctx("i1"));
  expect(res.status).toBe(200);
  expect((await res.json()).item.quantity).toBe(2);
  expect(updateInventoryItem).toHaveBeenCalledWith("org_1", "i1", { quantity: 2 });
});

test("DELETE removes storage objects then the item", async () => {
  vi.mocked(getInventoryItem).mockResolvedValue({
    id: "i1", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  vi.mocked(listInventoryItemImages).mockResolvedValue([
    { id: "im1", inventory_item_id: "i1", storage_path: "inventory/i1/a.jpg", created_at: "" },
  ]);
  const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("i1"));
  expect(res.status).toBe(200);
  expect(removeImages).toHaveBeenCalledWith(["inventory/i1/a.jpg"]);
  expect(deleteInventoryItem).toHaveBeenCalledWith("org_1", "i1");
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- "api/inventory/\[itemId\]/route"`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the item route**

Create `src/app/api/inventory/[itemId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    const body = (await request.json()) as {
      name?: string; category?: string; size?: string; quantity?: number; location?: string; notes?: string;
    };
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.category === "string") patch.category = body.category;
    if (typeof body.size === "string") patch.size = body.size;
    if (typeof body.quantity === "number") patch.quantity = body.quantity;
    if (typeof body.location === "string") patch.location = body.location;
    if (typeof body.notes === "string") patch.notes = body.notes;
    const item = await updateInventoryItem(orgId, itemId, patch);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId); // assert ownership before touching storage
    const images = await listInventoryItemImages(itemId);
    await removeImages(images.map((i) => i.storage_path));
    await deleteInventoryItem(orgId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- "api/inventory/\[itemId\]/route"`
Expected: PASS.

- [ ] **Step 9: Implement the images routes (no separate unit test — mirror the proven design-images route)**

Create `src/app/api/inventory/[itemId]/images/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { getInventoryItem } from "@/lib/data/inventory-items";
import {
  listInventoryItemImages,
  addInventoryItemImage,
  countInventoryItemImages,
} from "@/lib/data/inventory-item-images";
import { uploadImage, signImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string }> };

const MAX_PER_ITEM = 6;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    const images = await listInventoryItemImages(itemId);
    const urls = await signImageUrls(images.map((i) => i.storage_path));
    return NextResponse.json({
      images: images.map((i) => ({ id: i.id, url: urls[i.storage_path] ?? null })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    if ((await countInventoryItemImages(itemId)) >= MAX_PER_ITEM) {
      throw new ValidationError(`Up to ${MAX_PER_ITEM} photos per item`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    if (!file.type.startsWith("image/")) throw new ValidationError("File must be an image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `inventory/${itemId}/${crypto.randomUUID()}.jpg`;
    await uploadImage(path, bytes);
    const image = await addInventoryItemImage(itemId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/inventory/[itemId]/images/[imageId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem } from "@/lib/data/inventory-items";
import { deleteInventoryItemImage } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId, imageId } = await params;
    await getInventoryItem(orgId, itemId);
    const path = await deleteInventoryItemImage(itemId, imageId);
    if (path) await removeImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/inventory/[itemId]/usage/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem, listInventoryUsage } from "@/lib/data/inventory-items";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    const usage = await listInventoryUsage(itemId);
    return NextResponse.json({ usage });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 10: Extend the designs POST route to accept `inventoryItemId`**

In `src/app/api/productions/[id]/designs/route.ts`, add the import:

```ts
import { getInventoryItem } from "@/lib/data/inventory-items";
```

Replace the body of the `POST` `try` block (after `assertProductionInOrg`) with:

```ts
    const body = (await request.json()) as { roleId?: string; name?: string; inventoryItemId?: string };
    if (typeof body.roleId !== "string" || !body.roleId) throw new ValidationError("roleId is required");
    const roles = await listRoles(id);
    if (!roles.some((r) => r.id === body.roleId)) {
      throw new NotFoundError("Role not found in this production");
    }
    let name = typeof body.name === "string" ? body.name : "";
    let inventoryItemId: string | undefined;
    if (typeof body.inventoryItemId === "string" && body.inventoryItemId) {
      const item = await getInventoryItem(orgId, body.inventoryItemId);
      inventoryItemId = item.id;
      if (!name.trim()) name = item.name; // default the piece name from the item
    }
    const design = await createCostumeDesign({ productionId: id, roleId: body.roleId, name, inventoryItemId });
    return NextResponse.json({ design }, { status: 201 });
```

- [ ] **Step 11: Run the full suite + types**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add src/app/api/inventory "src/app/api/productions/[id]/designs/route.ts"
git commit -m "feat: inventory API routes + add-from-inventory on designs POST"
```

---

## Task 7: `readOnly` prop on `PhotoStrip`

**Files:**
- Modify: `src/components/PhotoStrip.tsx`

No unit tests exist for `PhotoStrip` (it's a client component); verify via lint + a manual smoke note.

- [ ] **Step 1: Add the prop**

In `src/components/PhotoStrip.tsx`, update the signature and destructuring:

```ts
export function PhotoStrip({
  endpoint,
  max,
  label,
  readOnly = false,
}: {
  endpoint: string;
  max: number;
  label?: string;
  readOnly?: boolean;
}) {
```

- [ ] **Step 2: Hide the delete button in read-only mode**

Wrap the per-thumbnail remove `<button>` (the one with `aria-label={`Remove photo ${i + 1}`}`) so it only renders when not read-only:

```tsx
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--red)] text-xs leading-none text-[var(--red-fg)] disabled:opacity-50"
                >
                  ×
                </button>
              )}
```

- [ ] **Step 3: Hide the add button in read-only mode**

Change the add-button guard from `{images.length < max && (` to:

```tsx
        {!readOnly && images.length < max && (
```

- [ ] **Step 4: Verify lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PhotoStrip.tsx
git commit -m "feat: PhotoStrip readOnly mode (no add/delete)"
```

---

## Task 8: `/inventory` page + `InventoryManager` + nav link

**Files:**
- Create: `src/components/InventoryManager.tsx`
- Create: `src/app/inventory/page.tsx`
- Modify: `src/app/productions/page.tsx`

No component unit tests (consistent with `MakersManager`); verify with lint + types + the full test suite, then a manual smoke check.

- [ ] **Step 1: Build `InventoryManager`**

Create `src/components/InventoryManager.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PhotoStrip } from "@/components/PhotoStrip";

export interface InventoryRow {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
}

export function InventoryManager({ initialItems }: { initialItems: InventoryRow[] }) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const { item } = (await res.json()) as { item: InventoryRow };
      setItems((prev) => [...prev, item]);
      setNewName("");
      setAdding(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add item");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this item? Pieces already pulled from it stay, but lose the link.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    else setError("Couldn't remove item");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm muted">No items yet. Add your on-hand stock below.</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <InventoryCard key={item.id} item={item} busy={busy} onRemove={() => remove(item.id)} />
        ))}
      </ul>
      {adding ? (
        <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
          <input
            autoFocus
            className="field min-w-0 flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name (e.g. Top hat)"
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">Add item</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(""); }} className="link-muted shrink-0 text-sm">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="link-muted text-sm">
          + add item
        </button>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function InventoryCard({ item, busy, onRemove }: { item: InventoryRow; busy: boolean; onRemove: () => void }) {
  const [usage, setUsage] = useState<{ designId: string; productionName: string; roleName: string }[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${item.id}/usage`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { usage: [] }))
      .then((d) => { if (active) setUsage(d.usage ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [item.id]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  }

  return (
    <li className="surface !shadow-none space-y-2 p-3">
      <div className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 font-medium"
          defaultValue={item.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && patch({ name: e.target.value })}
          aria-label="Item name"
        />
        <button type="button" onClick={onRemove} disabled={busy} className="shrink-0 text-sm text-[var(--red)] hover:underline disabled:opacity-50">
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className="field" defaultValue={item.category ?? ""} placeholder="Category"
          onBlur={(e) => e.target.value !== (item.category ?? "") && patch({ category: e.target.value })} aria-label="Category" />
        <input className="field" defaultValue={item.size ?? ""} placeholder="Size"
          onBlur={(e) => e.target.value !== (item.size ?? "") && patch({ size: e.target.value })} aria-label="Size" />
        <input className="field" type="number" min={0} defaultValue={item.quantity} placeholder="Qty"
          onBlur={(e) => Number(e.target.value) !== item.quantity && patch({ quantity: Number(e.target.value) })} aria-label="Quantity" />
        <input className="field" defaultValue={item.location ?? ""} placeholder="Location"
          onBlur={(e) => e.target.value !== (item.location ?? "") && patch({ location: e.target.value })} aria-label="Location" />
      </div>
      <textarea className="field w-full text-sm" rows={2} defaultValue={item.notes ?? ""} placeholder="Notes (optional)"
        onBlur={(e) => e.target.value !== (item.notes ?? "") && patch({ notes: e.target.value })} aria-label="Notes" />
      <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} label="Photos" />
      {usage.length > 0 && (
        <p className="text-xs muted">
          Used in: {usage.map((u) => `${u.productionName} → ${u.roleName}`).join(", ")}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Build the `/inventory` page**

Create `src/app/inventory/page.tsx`:

```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listInventoryItems } from "@/lib/data/inventory-items";
import { InventoryManager } from "@/components/InventoryManager";

export default async function InventoryPage() {
  const { orgId } = await getAuthContext();
  const items = await listInventoryItems(orgId);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="font-display text-3xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm muted">
          Your on-hand costume library. Photograph items here, then add them to a role from the Costume tab.
        </p>
      </div>
      <InventoryManager
        initialItems={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          size: i.size,
          quantity: i.quantity,
          location: i.location,
          notes: i.notes,
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `src/app/productions/page.tsx`, in the header link group, add an Inventory link next to Makers:

```tsx
          <Link href="/makers" className="link-muted text-sm">
            Makers
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
```

- [ ] **Step 4: Verify lint + types + suite**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Manual smoke check**

Run `npm run dev`, sign in, open `/inventory`. Add an item, edit fields, upload a photo, reload — confirm everything persists. (Requires migration 0018 applied — see Task 1.)

- [ ] **Step 6: Commit**

```bash
git add src/components/InventoryManager.tsx src/app/inventory/page.tsx src/app/productions/page.tsx
git commit -m "feat: /inventory library page + nav link"
```

---

## Task 9: Add-from-inventory picker + linked-piece rendering

**Files:**
- Create: `src/components/AddFromInventory.tsx`
- Modify: `src/components/RoleCostumePanel.tsx`

- [ ] **Step 1: Build the picker**

Create `src/components/AddFromInventory.tsx`:

```tsx
"use client";

import { useState } from "react";

interface PickItem {
  id: string;
  name: string;
  category: string | null;
  thumbUrl: string | null;
}

export function AddFromInventory({ onPick, busy }: { onPick: (itemId: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", { credentials: "include" });
      if (res.ok) {
        const { items } = (await res.json()) as { items: PickItem[] };
        setItems(items);
      } else {
        setError("Couldn't load inventory");
      }
    } catch {
      setError("Couldn't load inventory");
    }
    setLoading(false);
  }

  const q = filter.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
    : items;

  if (!open) {
    return (
      <button type="button" onClick={openPicker} disabled={busy} className="link-muted text-sm disabled:opacity-50">
        + add from inventory
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--field-line)] p-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="field min-w-0 flex-1 !p-1.5 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search inventory…"
        />
        <button type="button" onClick={() => setOpen(false)} className="link-muted shrink-0 text-sm">
          Close
        </button>
      </div>
      {loading && <p className="text-xs muted">Loading…</p>}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="text-xs muted">No items{q ? " match" : " in inventory yet"}.</p>
      )}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => { onPick(i.id); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-[var(--bg)] disabled:opacity-50"
            >
              {i.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumbUrl} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <div className="h-9 w-9 rounded bg-[var(--bg)]" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              {i.category && <span className="shrink-0 text-xs muted">{i.category}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Wire imports + the add handler into `RoleCostumePanel`**

In `src/components/RoleCostumePanel.tsx`, update imports:

```ts
import { COSTUME_SOURCES, DEFAULT_SOURCE, defaultSourceFor } from "@/lib/costume-sources";
import { AddFromInventory } from "@/components/AddFromInventory";
import Link from "next/link";
```

(`DEFAULT_SOURCE` may now be unused after Step 4 — if lint flags it, drop it from the import.)

Add an `addFromInventory` handler next to `addDesign` (inside the component):

```ts
  async function addFromInventory(inventoryItemId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId: role.id, inventoryItemId }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => [...prev, design]);
    } else setError("Couldn't add from inventory");
    setBusy(false);
  }
```

- [ ] **Step 3: Pass the handler + inventory-aware `renderExtra` into `PieceEditor`**

In the `return` of `RoleCostumePanel`, update the `<PieceEditor>` usage. Add the `onAddFromInventory` prop and branch `renderExtra` on the link:

```tsx
      <PieceEditor
        designs={roleDesigns}
        onAdd={addDesign}
        onAddFromInventory={addFromInventory}
        onRemove={removeDesign}
        onRename={renameDesign}
        busy={busy}
        storageKey={`nada:prod:${productionId}:role:${role.id}:piececollapsed`}
        renderExtra={(d) => (
          <div className="space-y-1.5">
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
              <PhotoStrip
                endpoint={`/api/productions/${productionId}/designs/${d.id}/images`}
                max={6}
              />
            )}
            <textarea
              className="field w-full text-sm"
              rows={2}
              defaultValue={d.notes ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (d.notes ?? "")) setDesignNotes(d.id, e.target.value);
              }}
              placeholder="Notes (optional)"
              aria-label={`Notes for ${d.name}`}
            />
          </div>
        )}
      />
```

- [ ] **Step 4: Make the per-piece source default inventory-aware**

In `RoleCostumePanel`, replace the two `?? DEFAULT_SOURCE` defaults so linked designs default to `on_hand`:

`makeCount` (inside the `ordered.map`):

```ts
          const makeCount = roleDesigns.filter(
            (d) => (sources[pieceKey(casting.id, d.id)]?.source ?? defaultSourceFor(d)) === "make",
          ).length;
```

the per-piece `source` (inside the inner `roleDesigns.map`):

```ts
                const source = pending ? "shared" : resolved?.source ?? defaultSourceFor(d);
```

- [ ] **Step 5: Add the `onAddFromInventory` prop to `PieceEditor` and render the picker**

Update the `PieceEditor` function signature/props type to add:

```ts
  onAddFromInventory,
```

and in its props type:

```ts
  onAddFromInventory?: (itemId: string) => void;
```

Then, in `PieceEditor`'s JSX, render the picker right after the "+ add piece" block (after the closing of the `{adding ? (...) : (...)}` expression, still inside the outer wrapper `div`):

```tsx
      {onAddFromInventory && <AddFromInventory onPick={onAddFromInventory} busy={busy} />}
```

- [ ] **Step 6: Verify lint + types + suite**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: PASS. (If `DEFAULT_SOURCE` is now unused, remove it from the import to satisfy lint.)

- [ ] **Step 7: Manual smoke check**

Run `npm run dev`. In a production's role Costume tab: click "+ add from inventory", pick an item → a new piece appears named after the item, showing its photos read-only with a "From inventory ↗" link, and its per-performer source defaults to "On hand". Confirm it does **not** appear in the Tailor's summary make worklist. (Requires migration 0018 applied.)

- [ ] **Step 8: Commit**

```bash
git add src/components/AddFromInventory.tsx src/components/RoleCostumePanel.tsx
git commit -m "feat: add-from-inventory picker + linked-piece rendering"
```

---

## Final verification

- [ ] Run the whole suite: `npm test` → all green.
- [ ] Types: `npx tsc --noEmit` → clean.
- [ ] Lint: `npm run lint` → clean.
- [ ] Build: `npm run build` → succeeds.
- [ ] Confirm migration `0018_inventory.sql` is applied to the shared Supabase project (manual, see Task 1).
- [ ] End-to-end manual: create an inventory item with a photo → add it to a role from the Costume tab → verify the linked piece (read-only photo, "From inventory" link, on-hand default) and that the item's library card shows "Used in: <Production> → <Role>".

> **Do not push / deploy** until Chris gives the green light (honor the no-push-without-greenlight rule). Local commits only.
