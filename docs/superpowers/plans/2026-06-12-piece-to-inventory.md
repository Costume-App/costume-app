# Add Costume Piece to House Inventory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a finished/bought costume piece be logged into House Inventory as a per-performer item (`"<design> (<performer>)"`, photos + notes copied), both manually from the Costume tab and via an inline prompt when a piece is marked made/purchased.

**Architecture:** A new nullable `costume_pieces.added_inventory_item_id` links a piece to the item created from it (idempotent, FK on delete set null). A data-layer `addPieceToInventory` orchestrates existing helpers (create item, copy each design photo intra-bucket, set the link); a thin `POST /api/productions/[id]/pieces/to-inventory` route exposes it. One shared `AddToInventoryControl` renders both the manual button and the inline prompt, wired into `RoleCostumePanel` (button + prompt) and `MakePieceRow` (prompt).

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (`supabaseAdmin` + storage `role-images` bucket), Clerk auth, Vitest. Spec: `docs/superpowers/specs/2026-06-12-piece-to-inventory-design.md`.

---

## Design decisions locked for this plan

- **Per-performer unit**, item name `"<design.name> (<performer.label>)"`. Applies to **make/purchase** pieces.
- **Idempotent**: a piece with `added_inventory_item_id` set re-returns that item, creating nothing.
- **Lazy make rows**: `setPieceInventoryItem` updates an existing row, or inserts a `source:"make"` row if none — it never overwrites an existing row's `source` (so a purchase row stays purchase).
- **Photos copy** intra-bucket (`…/designs/<id>/…` → `inventory/<itemId>/<uuid>.jpg`) via a new `copyImage` helper.
- **Prompt is transition-only** (fires on toggle to complete this session; not on load), dismissible, suppressed once added.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/0022_piece_inventory_link.sql` | **new** — add the link column. |
| `src/lib/storage.ts` | add `copyImage(from, to)`. |
| `src/lib/storage.test.ts` | **new** — test `copyImage`. |
| `src/lib/data/costume-pieces.ts` | add `added_inventory_item_id` to `CostumePiece`; add `setPieceInventoryItem`. |
| `src/lib/data/costume-pieces.test.ts` | add `setPieceInventoryItem` tests. |
| `src/lib/data/piece-to-inventory.ts` | **new** — `addPieceToInventory` orchestration. |
| `src/lib/data/piece-to-inventory.test.ts` | **new** — orchestration tests. |
| `src/app/api/productions/[id]/pieces/to-inventory/route.ts` (+ `.test.ts`) | **new** — POST route. |
| `src/components/AddToInventoryControl.tsx` | **new** — shared button + prompt. |
| `src/lib/tailor-summary.ts` (+ `.test.ts`) | thread `added_inventory_item_id` → `MakeItem.addedInventoryItemId`. |
| `src/components/RoleCostumePanel.tsx` | manual button + completion prompt. |
| `src/components/MakeWorklist.tsx`, `MakePieceRow.tsx` | completion prompt (worklist), `garmentName` prop. |

---

# PHASE A — Backend (Tasks 1–5)

## Task 1: Migration `0022_piece_inventory_link.sql`

**Files:** Create `supabase/migrations/0022_piece_inventory_link.sql`

No automated test (raw SQL); Chris applies it to Supabase before the manual check.

- [ ] **Step 1: Write the migration**

```sql
-- Links a costume piece to the House Inventory item created from it (one-to-one,
-- idempotent add). on delete set null so removing the item lets the piece be re-added.
alter table costume_pieces
  add column if not exists added_inventory_item_id uuid references inventory_items (id) on delete set null;
```

- [ ] **Step 2: Sanity check**

Run: `grep -c added_inventory_item_id supabase/migrations/0022_piece_inventory_link.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0022_piece_inventory_link.sql
git commit -m "feat: migration 0022 — costume_pieces.added_inventory_item_id"
```

---

## Task 2: `copyImage` storage helper

**Files:** Modify `src/lib/storage.ts`; Create `src/lib/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const copy = vi.fn();
const from = vi.fn(() => ({ copy }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { storage: { from: (b: string) => from(b) } } }));

import { copyImage } from "@/lib/storage";

beforeEach(() => {
  copy.mockReset();
  from.mockClear();
});

test("copyImage copies within the role-images bucket", async () => {
  copy.mockResolvedValue({ error: null });
  await copyImage("p1/designs/d1/a.jpg", "inventory/i1/x.jpg");
  expect(from).toHaveBeenCalledWith("role-images");
  expect(copy).toHaveBeenCalledWith("p1/designs/d1/a.jpg", "inventory/i1/x.jpg");
});

test("copyImage throws on a storage error", async () => {
  copy.mockResolvedValue({ error: { message: "nope" } });
  await expect(copyImage("a", "b")).rejects.toThrow("nope");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `copyImage` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/storage.ts`, after `removeImages`, add:

```ts
// Copy an object within the bucket (design photo → inventory photo live here).
export async function copyImage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).copy(fromPath, toPath);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: copyImage storage helper (intra-bucket copy)"
```

---

## Task 3: `added_inventory_item_id` field + `setPieceInventoryItem`

**Files:** Modify `src/lib/data/costume-pieces.ts`; Modify `src/lib/data/costume-pieces.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/data/costume-pieces.test.ts`. (The file already mocks `@/lib/supabase-admin`; reuse its mock pattern. If its mock doesn't expose chainable `update().eq().eq().select().maybeSingle()` and `insert()`, add a self-contained chainable mock at the top of these new tests using a local `from` spy — but prefer the file's existing harness.) Add:

```ts
test("setPieceInventoryItem updates an existing row's link without touching source", async () => {
  // Arrange the mock so update(...).eq(...).eq(...).select(...).maybeSingle() resolves a row.
  // (Use the file's existing chainable mock; configure the update path to return { id: 'pp1' }.)
  const { setPieceInventoryItem } = await import("@/lib/data/costume-pieces");
  await setPieceInventoryItem("d1", "c1", "item1");
  // Assert: an update with { added_inventory_item_id: "item1" } scoped by design+casting was issued,
  // and NO insert happened (row existed).
});

test("setPieceInventoryItem inserts a make row when none exists", async () => {
  // Configure the update path to resolve no row (maybeSingle → { data: null }).
  const { setPieceInventoryItem } = await import("@/lib/data/costume-pieces");
  await setPieceInventoryItem("d1", "c1", "item1");
  // Assert: an insert with { costume_design_id:"d1", casting_id:"c1", source:"make",
  // added_inventory_item_id:"item1" } was issued.
});
```

> Implementer note: `costume-pieces.test.ts` already has a Supabase mock for `upsertPieceSource`/`listCostumePieces`. Extend it minimally so the two assertions above can inspect the `update`/`insert` calls (spies). Keep the existing tests green. The assertions must check real calls (`expect(update).toHaveBeenCalledWith({ added_inventory_item_id: "item1" })`, `expect(insert).toHaveBeenCalledWith(expect.objectContaining({ source: "make", added_inventory_item_id: "item1" }))`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts`
Expected: FAIL — `setPieceInventoryItem` not exported.

- [ ] **Step 3: Implement**

In `src/lib/data/costume-pieces.ts`:

(a) Add the field to the `CostumePiece` interface (after `maker_id`):

```ts
  added_inventory_item_id: string | null;
```

(b) Add the function (after `upsertPieceSource`):

```ts
// Link a piece to the inventory item created from it. Updates the existing row's
// link (preserving its source); if there's no row yet (a lazy make default), inserts
// a make row carrying the link.
export async function setPieceInventoryItem(
  designId: string,
  castingId: string,
  itemId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("costume_pieces")
    .update({ added_inventory_item_id: itemId, updated_at: new Date().toISOString() })
    .eq("costume_design_id", designId)
    .eq("casting_id", castingId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const { error: insErr } = await supabaseAdmin
    .from("costume_pieces")
    .insert({
      costume_design_id: designId,
      casting_id: castingId,
      source: "make",
      added_inventory_item_id: itemId,
    });
  if (insErr) throw new Error(insErr.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

> Note: adding `added_inventory_item_id` to `CostumePiece` may surface `tsc` errors anywhere a `CostumePiece` literal is constructed in tests. Add `added_inventory_item_id: null` to those literals. (Search: `npx tsc --noEmit` will list them.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-pieces.ts src/lib/data/costume-pieces.test.ts
git commit -m "feat: costume_pieces.added_inventory_item_id + setPieceInventoryItem"
```

---

## Task 4: `addPieceToInventory` orchestration

**Files:** Create `src/lib/data/piece-to-inventory.ts` (+ `.test.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/piece-to-inventory.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));
const listCastings = vi.fn();
vi.mock("@/lib/data/castings", () => ({ listCastings: (...a: unknown[]) => listCastings(...a) }));
const listPerformers = vi.fn();
vi.mock("@/lib/data/performers", () => ({ listPerformers: (...a: unknown[]) => listPerformers(...a) }));
const listCostumePieces = vi.fn();
const setPieceInventoryItem = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  setPieceInventoryItem: (...a: unknown[]) => setPieceInventoryItem(...a),
}));
const createInventoryItem = vi.fn();
const getInventoryItem = vi.fn();
vi.mock("@/lib/data/inventory-items", () => ({
  createInventoryItem: (...a: unknown[]) => createInventoryItem(...a),
  getInventoryItem: (...a: unknown[]) => getInventoryItem(...a),
}));
const listCostumeDesignImages = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({ listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a) }));
const addInventoryItemImage = vi.fn();
vi.mock("@/lib/data/inventory-item-images", () => ({ addInventoryItemImage: (...a: unknown[]) => addInventoryItemImage(...a) }));
const copyImage = vi.fn();
vi.mock("@/lib/storage", () => ({ copyImage: (...a: unknown[]) => copyImage(...a) }));

import { addPieceToInventory } from "@/lib/data/piece-to-inventory";

beforeEach(() => {
  [listCostumeDesigns, listCastings, listPerformers, listCostumePieces, setPieceInventoryItem, createInventoryItem, getInventoryItem, listCostumeDesignImages, addInventoryItemImage, copyImage].forEach((m) => m.mockReset());
  listCostumeDesigns.mockResolvedValue([{ id: "d1", name: "Cloak", notes: "Line it" }]);
  listCastings.mockResolvedValue([{ id: "c1", performer_id: "pf1" }]);
  listPerformers.mockResolvedValue([{ id: "pf1", label: "Ana" }]);
});

test("creates a '<design> (<performer>)' item with the design notes and copies photos", async () => {
  listCostumePieces.mockResolvedValue([]); // no existing piece row / no prior link
  createInventoryItem.mockResolvedValue({ id: "item1", name: "Cloak (Ana)" });
  listCostumeDesignImages.mockResolvedValue([{ storage_path: "p1/designs/d1/a.jpg" }, { storage_path: "p1/designs/d1/b.jpg" }]);

  const res = await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(createInventoryItem).toHaveBeenCalledWith("org_1", { name: "Cloak (Ana)", notes: "Line it", quantity: 1 });
  expect(copyImage).toHaveBeenCalledTimes(2);
  expect(copyImage).toHaveBeenNthCalledWith(1, "p1/designs/d1/a.jpg", expect.stringContaining("inventory/item1/"));
  expect(addInventoryItemImage).toHaveBeenCalledTimes(2);
  expect(addInventoryItemImage).toHaveBeenCalledWith("item1", expect.stringContaining("inventory/item1/"));
  expect(setPieceInventoryItem).toHaveBeenCalledWith("d1", "c1", "item1");
  expect(res).toEqual({ item: { id: "item1", name: "Cloak (Ana)" }, addedInventoryItemId: "item1" });
});

test("is idempotent — an already-linked piece returns the existing item, creating nothing", async () => {
  listCostumePieces.mockResolvedValue([{ casting_id: "c1", costume_design_id: "d1", added_inventory_item_id: "old1" }]);
  getInventoryItem.mockResolvedValue({ id: "old1", name: "Cloak (Ana)" });

  const res = await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(getInventoryItem).toHaveBeenCalledWith("org_1", "old1");
  expect(createInventoryItem).not.toHaveBeenCalled();
  expect(copyImage).not.toHaveBeenCalled();
  expect(setPieceInventoryItem).not.toHaveBeenCalled();
  expect(res).toEqual({ item: { id: "old1", name: "Cloak (Ana)" }, addedInventoryItemId: "old1" });
});

test("a photoless design yields an item with no image copies", async () => {
  listCostumePieces.mockResolvedValue([]);
  createInventoryItem.mockResolvedValue({ id: "item2", name: "Cloak (Ana)" });
  listCostumeDesignImages.mockResolvedValue([]);

  await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(copyImage).not.toHaveBeenCalled();
  expect(addInventoryItemImage).not.toHaveBeenCalled();
  expect(setPieceInventoryItem).toHaveBeenCalledWith("d1", "c1", "item2");
});

test("throws NotFound when the design isn't in the production", async () => {
  listCostumeDesigns.mockResolvedValue([]);
  const { NotFoundError } = await import("@/lib/errors");
  await expect(addPieceToInventory("org_1", "p1", "dX", "c1")).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/piece-to-inventory.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/data/piece-to-inventory.ts`:

```ts
import { NotFoundError } from "@/lib/errors";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { listCostumePieces, setPieceInventoryItem } from "@/lib/data/costume-pieces";
import { createInventoryItem, getInventoryItem, type InventoryItem } from "@/lib/data/inventory-items";
import { listCostumeDesignImages } from "@/lib/data/costume-design-images";
import { addInventoryItemImage } from "@/lib/data/inventory-item-images";
import { copyImage } from "@/lib/storage";

// Create a House Inventory item from one performer's costume piece (make/purchase).
// Copies the design's photos and notes; links the piece so it's idempotent.
export async function addPieceToInventory(
  orgId: string,
  productionId: string,
  designId: string,
  castingId: string,
): Promise<{ item: InventoryItem; addedInventoryItemId: string }> {
  const [designs, castings, performers, pieces] = await Promise.all([
    listCostumeDesigns(productionId),
    listCastings(productionId),
    listPerformers(productionId),
    listCostumePieces([designId]),
  ]);

  const design = designs.find((d) => d.id === designId);
  if (!design) throw new NotFoundError("Costume piece not found");
  const casting = castings.find((c) => c.id === castingId);
  if (!casting) throw new NotFoundError("Casting not found");
  const performer = performers.find((p) => p.id === casting.performer_id);

  const piece = pieces.find((p) => p.casting_id === castingId);
  if (piece?.added_inventory_item_id) {
    const item = await getInventoryItem(orgId, piece.added_inventory_item_id);
    return { item, addedInventoryItemId: piece.added_inventory_item_id };
  }

  const name = `${design.name} (${performer?.label ?? "Unknown"})`;
  const item = await createInventoryItem(orgId, { name, notes: design.notes, quantity: 1 });

  const images = await listCostumeDesignImages(designId);
  for (const img of images) {
    const toPath = `inventory/${item.id}/${crypto.randomUUID()}.jpg`;
    await copyImage(img.storage_path, toPath);
    await addInventoryItemImage(item.id, toPath);
  }

  await setPieceInventoryItem(designId, castingId, item.id);
  return { item, addedInventoryItemId: item.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/piece-to-inventory.test.ts` → PASS (4 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/piece-to-inventory.ts src/lib/data/piece-to-inventory.test.ts
git commit -m "feat: addPieceToInventory — create House Inventory item from a piece"
```

---

## Task 5: Route — `POST /api/productions/[id]/pieces/to-inventory`

**Files:** Create `src/app/api/productions/[id]/pieces/to-inventory/route.ts` (+ `.test.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/pieces/to-inventory/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertCastingInProduction = vi.fn();
const assertDesignInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertCastingInProduction: (...a: unknown[]) => assertCastingInProduction(...a),
  assertDesignInProduction: (...a: unknown[]) => assertDesignInProduction(...a),
}));

const addPieceToInventory = vi.fn();
vi.mock("@/lib/data/piece-to-inventory", () => ({ addPieceToInventory: (...a: unknown[]) => addPieceToInventory(...a) }));

import { POST } from "@/app/api/productions/[id]/pieces/to-inventory/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertCastingInProduction, assertDesignInProduction, addPieceToInventory].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("POST adds the piece to inventory and returns the item", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  addPieceToInventory.mockResolvedValue({ item: { id: "item1", name: "Cloak (Ana)" }, addedInventoryItemId: "item1" });

  const res = await POST(req({ designId: "d1", castingId: "c1" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ item: { id: "item1", name: "Cloak (Ana)" }, addedInventoryItemId: "item1" });
  expect(assertCastingInProduction).toHaveBeenCalledWith("p1", "c1");
  expect(assertDesignInProduction).toHaveBeenCalledWith("p1", "d1");
  expect(addPieceToInventory).toHaveBeenCalledWith("org_1", "p1", "d1", "c1");
});

test("POST 400 when designId or castingId is missing", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  const res = await POST(req({ designId: "d1" }), ctx("p1"));
  expect(res.status).toBe(400);
  expect(addPieceToInventory).not.toHaveBeenCalled();
});

test("POST 404 when the production isn't in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ designId: "d1", castingId: "c1" }), ctx("p1"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/to-inventory/route.test.ts"`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/api/productions/[id]/pieces/to-inventory/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertCastingInProduction, assertDesignInProduction } from "@/lib/data/production-access";
import { addPieceToInventory } from "@/lib/data/piece-to-inventory";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { designId?: string; castingId?: string };
    if (typeof body.designId !== "string" || typeof body.castingId !== "string") {
      throw new ValidationError("designId and castingId are required");
    }
    await assertDesignInProduction(id, body.designId);
    await assertCastingInProduction(id, body.castingId);
    const result = await addPieceToInventory(orgId, id, body.designId, body.castingId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/to-inventory/route.test.ts"` → PASS (3 tests). Then `npx tsc --noEmit` → clean and `npx vitest run` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/pieces/to-inventory"
git commit -m "feat: POST pieces/to-inventory route"
```

---

# PHASE B — Frontend (Tasks 6–8)

## Task 6: Shared `AddToInventoryControl` + thread the link onto the worklist

**Files:** Create `src/components/AddToInventoryControl.tsx`; Modify `src/lib/tailor-summary.ts` (+ `.test.ts`)

- [ ] **Step 1: Write the failing test (worklist threading)**

In `src/lib/tailor-summary.test.ts`, add a test that `buildMakeWorklist` surfaces the link on the item. (Match the file's existing `buildMakeWorklist` test setup for roles/designs/castings/performers/casts; the key addition is a piece row carrying `added_inventory_item_id`.)

```ts
test("buildMakeWorklist surfaces added_inventory_item_id as item.addedInventoryItemId", async () => {
  const { buildMakeWorklist } = await import("@/lib/tailor-summary");
  const roles = [{ id: "r1", name: "Lead", notes: null }];
  const designs = [{ id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null }];
  const castings = [{ id: "c1", cast_id: "cast1", role_id: "r1", performer_id: "pf1", assignment: "primary" as const }];
  const performers = [{ id: "pf1", name: "Ana" }];
  const casts = [{ id: "cast1", name: "Cast A" }];
  const pieces = [{
    costume_design_id: "d1", casting_id: "c1", source: "make" as const,
    fabric_type: null, fabric_color: null, fabric_width: null, fabric_supplier: null,
    fabric_yardage: null, fabric_unit_cost: null, made: false, maker_id: null,
    added_inventory_item_id: "item1",
  }];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.roles[0].garments[0].items[0].addedInventoryItemId).toBe("item1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `addedInventoryItemId` is undefined (not on `MakeItem`).

- [ ] **Step 3: Implement the threading**

In `src/lib/tailor-summary.ts`:

(a) Add to the `PieceRow` interface (after `maker_id`):

```ts
  added_inventory_item_id: string | null;
```

(b) Add to the `MakeItem` interface (after `makerId`):

```ts
  addedInventoryItemId: string | null;
```

(c) In `buildMakeWorklist`, in the `items.push({...})` object (after `makerId: row?.maker_id ?? null,`):

```ts
          addedInventoryItemId: row?.added_inventory_item_id ?? null,
```

> Note: `PieceRow` literals in other tests may now need `added_inventory_item_id: null`. `npx tsc --noEmit` will flag them; add the field.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tailor-summary.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Create `AddToInventoryControl`**

Create `src/components/AddToInventoryControl.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

// Shared control for adding a costume piece to House Inventory. Two modes:
// "button" (manual, flips to a link once added) and "prompt" (inline yes/no shown
// right after a piece is marked complete). Persistence is the server's; the parent
// supplies addedItemId and is told the new id via onAdded.
export function AddToInventoryControl({
  productionId,
  designId,
  castingId,
  pieceLabel,
  addedItemId,
  mode,
  onAdded,
  onDismiss,
}: {
  productionId: string;
  designId: string;
  castingId: string;
  pieceLabel: string;
  addedItemId: string | null;
  mode: "button" | "prompt";
  onAdded: (itemId: string) => void;
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/pieces/to-inventory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ designId, castingId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { addedInventoryItemId: string };
        onAdded(data.addedInventoryItemId);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add to inventory");
      }
    } catch {
      setError("Couldn't add to inventory");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "button") {
    if (addedItemId) {
      return (
        <Link href={`/inventory?item=${addedItemId}`} className="shrink-0 text-xs muted hover:text-[var(--red)] hover:underline">
          ✓ In House Inventory ↗
        </Link>
      );
    }
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={add} disabled={busy} className="text-xs text-[var(--red)] hover:underline disabled:opacity-50">
          {busy ? "Adding…" : "+ to House Inventory"}
        </button>
        {error && <span className="text-xs text-[var(--red)]">{error}</span>}
      </div>
    );
  }

  // prompt mode
  if (addedItemId) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-[var(--field-line)] bg-[var(--bg)] px-2 py-1.5 text-sm">
      <span>Add <strong>{pieceLabel}</strong> to House Inventory?</span>
      <button type="button" onClick={add} disabled={busy} className="btn-primary !px-2 !py-0.5 text-xs">
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={onDismiss} disabled={busy} className="link-muted text-xs">
        Not now
      </button>
      {error && <span className="text-xs text-[var(--red)]">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors. `npx vitest run` → all green.

```bash
git add src/components/AddToInventoryControl.tsx src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat: AddToInventoryControl + thread piece→inventory link onto the worklist"
```

---

## Task 7: Wire into the Costume tab (`RoleCostumePanel`)

**Files:** Modify `src/components/RoleCostumePanel.tsx`

UI wiring — verify with `tsc`/`lint`/`build` + manual. Read the file's per-performer piece-row block (around the `roleDesigns.map((d) => { … })` that renders the source `<select>`, `MakeAssignment`, and the Purchased checkbox) before editing.

- [ ] **Step 1: Add a "just completed" tracker + a local helper to record the link**

Near the other `useState` hooks in `RoleCostumePanel`, add:

```tsx
  const [justCompleted, setJustCompleted] = useState<Record<string, boolean>>({});

  function markAddedToInventory(designId: string, castingId: string, itemId: string) {
    setPieces((prev) =>
      prev.map((p) =>
        p.costume_design_id === designId && p.casting_id === castingId
          ? { ...p, added_inventory_item_id: itemId }
          : p,
      ),
    );
    setJustCompleted((m) => ({ ...m, [pieceKey(castingId, designId)]: false }));
  }
```

- [ ] **Step 2: Fire the prompt when a piece is toggled complete**

`setPieceField(d.id, casting.id, { made })` already persists made/purchased. Wrap the two `onToggleMade`/Purchased `onChange` handlers so that toggling **to true** (for make/purchase) opens the prompt. Replace the `MakeAssignment`'s `onToggleMade` with:

```tsx
                          onToggleMade={(md) => {
                            setPieceField(d.id, casting.id, { made: md });
                            if (md && !piece?.added_inventory_item_id) {
                              setJustCompleted((m) => ({ ...m, [key]: true }));
                            }
                          }}
```

and the Purchased checkbox `onChange` with:

```tsx
                            onChange={(e) => {
                              setPieceField(d.id, casting.id, { made: e.target.checked });
                              if (e.target.checked && !piece?.added_inventory_item_id) {
                                setJustCompleted((m) => ({ ...m, [key]: true }));
                              }
                            }}
```

- [ ] **Step 3: Render the manual button (make/purchase) and the prompt**

Import at the top:

```tsx
import { AddToInventoryControl } from "@/components/AddToInventoryControl";
```

Inside the piece row, the controls live in the inner `<div className="flex items-center gap-2">`. After the `MakeAssignment`/Purchased blocks, before that inner div closes, add the manual button (make/purchase only):

```tsx
                      {(source === "make" || source === "purchase") && (
                        <AddToInventoryControl
                          productionId={productionId}
                          designId={d.id}
                          castingId={casting.id}
                          pieceLabel={`${d.name} (${nameOf(casting.performerId)})`}
                          addedItemId={piece?.added_inventory_item_id ?? null}
                          mode="button"
                          onAdded={(itemId) => markAddedToInventory(d.id, casting.id, itemId)}
                        />
                      )}
```

Then, just after that inner controls `</div>` (but still inside the row's outer `<div className="flex flex-col gap-1 py-1">`), render the prompt when this piece was just completed:

```tsx
                    {justCompleted[key] && (source === "make" || source === "purchase") && (
                      <AddToInventoryControl
                        productionId={productionId}
                        designId={d.id}
                        castingId={casting.id}
                        pieceLabel={`${d.name} (${nameOf(casting.performerId)})`}
                        addedItemId={piece?.added_inventory_item_id ?? null}
                        mode="prompt"
                        onAdded={(itemId) => markAddedToInventory(d.id, casting.id, itemId)}
                        onDismiss={() => setJustCompleted((m) => ({ ...m, [key]: false }))}
                      />
                    )}
```

(`key`, `d`, `casting`, `source`, `piece`, and `nameOf` are all already in scope in this block.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors. `npx vitest run` → green. `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/RoleCostumePanel.tsx
git commit -m "feat: add-to-House-Inventory button + completion prompt on the Costume tab"
```

---

## Task 8: Completion prompt in the worklist (`MakePieceRow` + `MakeWorklist`)

**Files:** Modify `src/components/MakeWorklist.tsx`, `src/components/MakePieceRow.tsx`

UI wiring — verify with `tsc`/`lint`/`build` + manual.

- [ ] **Step 1: Pass `garmentName` to `MakePieceRow`**

In `src/components/MakeWorklist.tsx`, where `<MakePieceRow … />` is rendered inside the garment loop, add the garment's name (the loop variable for the garment exposes `designName`):

```tsx
                    garmentName={garment.designName}
```

(If the garment variable has a different name in the file, use `<thatVar>.designName`.)

- [ ] **Step 2: Accept `garmentName`, add the prompt state, and render the prompt**

In `src/components/MakePieceRow.tsx`:

(a) Add `garmentName` to the destructured props and the prop type (after `item`):

```tsx
  garmentName,
```
```tsx
  garmentName: string;
```

(b) Add the import and prompt state near the other `useState`s:

```tsx
import { AddToInventoryControl } from "@/components/AddToInventoryControl";
```
```tsx
  const [promptOpen, setPromptOpen] = useState(false);
  const [addedItemId, setAddedItemId] = useState<string | null>(item.addedInventoryItemId);
```

(c) In `toggleMade`, open the prompt on completion (only when not already added):

```tsx
  function toggleMade(next: boolean) {
    setMade(next);
    save({ made: next });
    if (next && !addedItemId) setPromptOpen(true);
  }
```

(d) Render the prompt at the end of the row. Immediately before the closing `</li>` (after the `{open && ( … )}` details block), add:

```tsx
      {promptOpen && (
        <div className="px-3 pb-3">
          <AddToInventoryControl
            productionId={productionId}
            designId={item.designId}
            castingId={item.castingId}
            pieceLabel={`${garmentName} (${item.performerName})`}
            addedItemId={addedItemId}
            mode="prompt"
            onAdded={(id) => { setAddedItemId(id); setPromptOpen(false); }}
            onDismiss={() => setPromptOpen(false)}
          />
        </div>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors. `npx vitest run` → green. `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/MakeWorklist.tsx src/components/MakePieceRow.tsx
git commit -m "feat: add-to-House-Inventory prompt in the make worklist (Costume Creations + My Work)"
```

---

## Verification (manual, after migration 0022 is applied)

Chris applies `0022` to Supabase. Then, signed in:

1. On a production's **Costume tab**, expand a performer with a **make** piece that has photos. Tick it **made** → the inline *"Add Cloak (Ana) to House Inventory?"* prompt appears. Click **Add** → it becomes **✓ In House Inventory ↗**, and the item (with the copied photos) shows up in **House Inventory** named "Cloak (Ana)".
2. The standalone **+ to House Inventory** button on that piece does the same without waiting for completion; it flips to the linked state after.
3. Tick a **purchase** piece **Purchased** → same prompt. (on_hand/shared pieces show neither button nor prompt.)
4. In **Costume Creations** / **My Work**, tick a make piece **made** → the prompt appears under the row; **Add** logs it.
5. Re-adding an already-added piece returns the same item (no duplicate). Remove the item in House Inventory → the piece can be added again.

## Self-Review (completed by plan author)

- **Spec coverage:** §1 data model → Task 1 + Task 3 (field). §2 copyImage → Task 2. §3 `addPieceToInventory` (name, notes, photo copy, link, idempotent, lazy-row) → Task 4 + `setPieceInventoryItem` in Task 3. §4 route → Task 5. §5 shared control → Task 6; Costume-tab button+prompt → Task 7; worklist prompt → Task 8. §6 state threading → Task 6 (types) + Tasks 7/8 (local update). Testing → Tasks 2–6 tests + manual steps.
- **Placeholder scan:** the only prose-described steps are Task 3's two `setPieceInventoryItem` tests (the implementer extends the existing chained mock) — that's a deliberate, explained instruction with concrete assertions, not a TBD. Everything else has full code.
- **Type consistency:** `added_inventory_item_id` (snake) on `CostumePiece`/`PieceRow`; `addedInventoryItemId` (camel) on `MakeItem` and as the component prop; `addPieceToInventory(orgId, productionId, designId, castingId) → { item, addedInventoryItemId }` matches across data/route/test/component. Route path `pieces/to-inventory` consistent. `setPieceInventoryItem(designId, castingId, itemId)` consistent.
- **Idempotency + lazy-row** both have explicit tasks/tests.
```
