# Tailor's Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-wide "Tailor's summary" page with an items-to-make worklist (per-piece fabric + made/complete) and an aggregated fabric purchase list.

**Architecture:** A new server route `/productions/[id]/summary` loads roles/casts/castings/performers/designs/pieces and renders a client `TailorSummary` with two tabs. Pure helpers in `src/lib/tailor-summary.ts` derive the worklist and the fabric purchase aggregation. Fabric + made are stored as new columns on `costume_pieces`; the existing lazy-default delete rule is revised so fabric/made rows survive. Edits save-on-blur through the existing `PUT /pieces` endpoint, extended to carry fabric/made.

**Tech Stack:** Next.js 16 (App Router, server components), React client components, Supabase (PostgreSQL), Vitest. Path alias `@/*` → `./src/*`.

**Spec:** `docs/superpowers/specs/2026-06-07-tailor-summary-design.md`

---

## ⚠️ Database gating note

This feature adds migration `0011_costume_fabric.sql`. **Applying it to Supabase is gated on Chris** (he applies migrations himself, same as pushes — see the "no push without green light" convention). All unit tests in this plan are DB-free (pure helpers + mocked API), so Tasks 1–7 can be fully built and verified without applying the migration. End-to-end manual verification (Task 9) requires the migration applied to the dev Supabase project first.

---

## File Structure

- **Create** `supabase/migrations/0011_costume_fabric.sql` — fabric + made columns on `costume_pieces`.
- **Modify** `src/lib/costume-merge.ts` — add pure `pieceRowIsEmpty()` predicate.
- **Modify** `src/lib/costume-merge.test.ts` — tests for `pieceRowIsEmpty()`.
- **Modify** `src/lib/data/costume-pieces.ts` — extend `CostumePiece` + `upsertPieceSource` (write fabric/made, revised delete rule).
- **Create** `src/lib/tailor-summary.ts` — pure helpers `buildMakeWorklist()` + `buildFabricPurchaseList()` and shared types.
- **Create** `src/lib/tailor-summary.test.ts` — tests for both helpers.
- **Modify** `src/app/api/productions/[id]/pieces/route.ts` — accept/validate fabric + made on `PUT`.
- **Modify** `src/app/api/productions/[id]/pieces/route.test.ts` — tests for the new fields.
- **Create** `src/components/TailorSummary.tsx` — client; holds pieces state, tab switch, derives worklist/purchase.
- **Create** `src/components/MakeWorklist.tsx` — Tab 1 layout (role → garment → rows).
- **Create** `src/components/MakePieceRow.tsx` — editable per-piece row (fabric fields + made), save-on-blur.
- **Create** `src/components/FabricPurchaseList.tsx` — Tab 2 aggregated table + unspecified bucket.
- **Create** `src/app/productions/[id]/summary/page.tsx` — server route.
- **Modify** `src/app/productions/[id]/page.tsx` — entry-point link beside Production Notes.

---

## Task 1: Migration — fabric + made columns

**Files:**
- Create: `supabase/migrations/0011_costume_fabric.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Structured fabric details + made/complete tracking, per performer's piece.
alter table costume_pieces add column fabric_type      text;
alter table costume_pieces add column fabric_color     text;
alter table costume_pieces add column fabric_width     text;
alter table costume_pieces add column fabric_supplier  text;
alter table costume_pieces add column fabric_yardage   numeric;
alter table costume_pieces add column fabric_unit_cost numeric;
alter table costume_pieces add column made             boolean not null default false;
alter table costume_pieces add column made_at          timestamptz;
```

- [ ] **Step 2: Commit** (migration is applied to Supabase separately, gated on Chris)

```bash
git add supabase/migrations/0011_costume_fabric.sql
git commit -m "feat(db): fabric details + made flag on costume_pieces (0011)"
```

---

## Task 2: Pure predicate `pieceRowIsEmpty()`

A `costume_pieces` row should be deleted only when it carries no meaningful data. This pure predicate is the testable core of the revised lazy-default rule.

**Files:**
- Modify: `src/lib/costume-merge.ts`
- Test: `src/lib/costume-merge.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/costume-merge.test.ts`

```ts
import { pieceRowIsEmpty } from "@/lib/costume-merge";

const emptyInput = {
  source: "make" as const,
  sourceNote: null,
  fabricType: null,
  fabricColor: null,
  fabricWidth: null,
  fabricSupplier: null,
  fabricYardage: null,
  fabricUnitCost: null,
  made: false,
};

test("pieceRowIsEmpty: bare make row with nothing set is empty", () => {
  expect(pieceRowIsEmpty(emptyInput)).toBe(true);
});

test("pieceRowIsEmpty: non-make source is never empty", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, source: "on_hand" })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, source: "shared" })).toBe(false);
});

test("pieceRowIsEmpty: a note keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, sourceNote: "from scratch" })).toBe(false);
});

test("pieceRowIsEmpty: any fabric field keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, fabricType: "wool" })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, fabricYardage: 2 })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, fabricUnitCost: 0 })).toBe(false);
});

test("pieceRowIsEmpty: made keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, made: true })).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/costume-merge.test.ts`
Expected: FAIL — `pieceRowIsEmpty is not a function` / not exported.

- [ ] **Step 3: Implement** — append to `src/lib/costume-merge.ts`

```ts
// True when a costume_pieces row carries no meaningful data and can be deleted
// (the lazy default: absence of a row means "make"). Note must already be trimmed
// to null when blank.
export function pieceRowIsEmpty(input: {
  source: "make" | "on_hand" | "shared";
  sourceNote: string | null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  made: boolean;
}): boolean {
  const hasFabric =
    !!(input.fabricType || input.fabricColor || input.fabricWidth || input.fabricSupplier) ||
    input.fabricYardage != null ||
    input.fabricUnitCost != null;
  return input.source === "make" && !input.sourceNote && !hasFabric && !input.made;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/costume-merge.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/costume-merge.ts src/lib/costume-merge.test.ts
git commit -m "feat: pieceRowIsEmpty predicate for fabric/made-aware lazy default"
```

---

## Task 3: Extend `costume-pieces` data layer

**Files:**
- Modify: `src/lib/data/costume-pieces.ts`

No new unit test (this module hits Supabase directly and is covered via the mocked API test in Task 5 + the pure predicate in Task 2). Keep changes minimal.

- [ ] **Step 1: Extend the `CostumePiece` interface**

Replace the existing interface (`costume-pieces.ts:5-14`) with:

```ts
export interface CostumePiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  shared_with_piece_id: string | null;
  source_note: string | null;
  fabric_type: string | null;
  fabric_color: string | null;
  fabric_width: string | null;
  fabric_supplier: string | null;
  fabric_yardage: number | null;
  fabric_unit_cost: number | null;
  made: boolean;
  made_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add the import for the predicate**

At the top of `costume-pieces.ts`, alongside the existing imports:

```ts
import { pieceRowIsEmpty } from "@/lib/costume-merge";
```

- [ ] **Step 3: Extend `upsertPieceSource`**

Replace the whole `upsertPieceSource` function (`costume-pieces.ts:54-99`) with:

```ts
// Upsert a performer's piece (source + fabric + made). A fully-empty make row is
// deleted (lazy default). For `shared`, references the borrowed *performer* (casting).
// Returns the row, or null when cleared.
export async function upsertPieceSource(input: {
  designId: string;
  castingId: string;
  source: CostumeSource;
  sharedWithCastingId?: string | null;
  sourceNote?: string | null;
  fabricType?: string | null;
  fabricColor?: string | null;
  fabricWidth?: string | null;
  fabricSupplier?: string | null;
  fabricYardage?: number | null;
  fabricUnitCost?: number | null;
  made?: boolean;
}): Promise<CostumePiece | null> {
  const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);
  const num = (n?: number | null) =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  const note = clean(input.sourceNote);
  const fabricType = clean(input.fabricType);
  const fabricColor = clean(input.fabricColor);
  const fabricWidth = clean(input.fabricWidth);
  const fabricSupplier = clean(input.fabricSupplier);
  const fabricYardage = num(input.fabricYardage);
  const fabricUnitCost = num(input.fabricUnitCost);
  const made = input.made ?? false;

  if (
    pieceRowIsEmpty({
      source: input.source,
      sourceNote: note,
      fabricType,
      fabricColor,
      fabricWidth,
      fabricSupplier,
      fabricYardage,
      fabricUnitCost,
      made,
    })
  ) {
    const { error } = await supabaseAdmin
      .from("costume_pieces")
      .delete()
      .eq("costume_design_id", input.designId)
      .eq("casting_id", input.castingId);
    if (error) throw new Error(error.message);
    return null;
  }

  let sharedWith: string | null = null;
  if (input.source === "shared") {
    if (!input.sharedWithCastingId) throw new ValidationError("Pick whose piece this shares");
    if (input.sharedWithCastingId === input.castingId) {
      throw new ValidationError("Cannot share with yourself");
    }
    sharedWith = await ensureShareTarget(input.designId, input.sharedWithCastingId);
  }

  const { data, error } = await supabaseAdmin
    .from("costume_pieces")
    .upsert(
      {
        costume_design_id: input.designId,
        casting_id: input.castingId,
        source: input.source,
        shared_with_piece_id: sharedWith,
        source_note: note,
        fabric_type: fabricType,
        fabric_color: fabricColor,
        fabric_width: fabricWidth,
        fabric_supplier: fabricSupplier,
        fabric_yardage: fabricYardage,
        fabric_unit_cost: fabricUnitCost,
        made,
        made_at: made ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "costume_design_id,casting_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumePiece;
}
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-pieces.ts
git commit -m "feat: persist fabric + made on costume pieces"
```

---

## Task 4: Pure helpers — worklist + fabric purchase list

**Files:**
- Create: `src/lib/tailor-summary.ts`
- Test: `src/lib/tailor-summary.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/tailor-summary.test.ts`

```ts
import { expect, test } from "vitest";
import { buildMakeWorklist, buildFabricPurchaseList, type PieceRow } from "@/lib/tailor-summary";

const roles = [
  { id: "r1", name: "Wizard", notes: "flowing" },
  { id: "r2", name: "Page", notes: null },
];
const designs = [
  { id: "d1", role_id: "r1", name: "Cloak", display_order: 0 },
  { id: "d2", role_id: "r1", name: "Hat", display_order: 1 },
  { id: "d3", role_id: "r2", name: "Tunic", display_order: 0 },
];
const castings = [
  { id: "c1", cast_id: "castA", role_id: "r1", performer_id: "p1", assignment: "primary" as const },
  { id: "c2", cast_id: "castB", role_id: "r1", performer_id: "p2", assignment: "understudy" as const },
  { id: "c3", cast_id: "castA", role_id: "r2", performer_id: "p3", assignment: "primary" as const },
];
const performers = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bea" },
  { id: "p3", name: "Cy" },
];
const casts = [
  { id: "castA", name: "Cast A" },
  { id: "castB", name: "Cast B" },
];

function row(overrides: Partial<PieceRow> & Pick<PieceRow, "costume_design_id" | "casting_id">): PieceRow {
  return {
    source: "make",
    fabric_type: null,
    fabric_color: null,
    fabric_width: null,
    fabric_supplier: null,
    fabric_yardage: null,
    fabric_unit_cost: null,
    made: false,
    ...overrides,
  };
}

test("buildMakeWorklist: lazy default — no rows means everything is to-make", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  // r1: Cloak(c1,c2) + Hat(c1,c2) = 4; r2: Tunic(c3) = 1
  expect(wl.totalItems).toBe(5);
  expect(wl.madeItems).toBe(0);
  expect(wl.roles.map((r) => r.roleName)).toEqual(["Wizard", "Page"]);
  expect(wl.roles[0].garments.map((g) => g.designName)).toEqual(["Cloak", "Hat"]);
  expect(wl.roles[0].garments[0].items.map((i) => i.performerName)).toEqual(["Ada", "Bea"]);
});

test("buildMakeWorklist: on_hand and shared are excluded; made is counted", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "on_hand" }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "shared" }),
    row({ costume_design_id: "d1", casting_id: "c2", made: true }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.totalItems).toBe(3); // 5 minus the on_hand + shared
  expect(wl.madeItems).toBe(1);
});

test("buildMakeWorklist: garment with zero make items is omitted", () => {
  const pieces = [
    row({ costume_design_id: "d3", casting_id: "c3", source: "on_hand" }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.roles.map((r) => r.roleName)).toEqual(["Wizard"]); // Page's only garment is on_hand
});

test("buildFabricPurchaseList: groups by type+color+width+supplier and sums", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", fabric_type: "wool", fabric_color: "navy", fabric_width: '60"', fabric_supplier: "Mood", fabric_yardage: 2, fabric_unit_cost: 10 }),
    row({ costume_design_id: "d1", casting_id: "c2", fabric_type: "wool", fabric_color: "navy", fabric_width: '60"', fabric_supplier: "Mood", fabric_yardage: 2.5, fabric_unit_cost: 10 }),
    row({ costume_design_id: "d2", casting_id: "c1", fabric_type: "felt", fabric_yardage: 1, fabric_unit_cost: 4 }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  const pl = buildFabricPurchaseList(items);
  const wool = pl.lines.find((l) => l.type === "wool")!;
  expect(wool.totalYardage).toBe(4.5);
  expect(wool.estCost).toBe(45);
  expect(wool.pieceCount).toBe(2);
  expect(pl.totalYardage).toBe(5.5);
  expect(pl.totalCost).toBe(49);
});

test("buildFabricPurchaseList: pieces without a fabric type go to unspecified", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", fabric_yardage: 3 }), // no type
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  const pl = buildFabricPurchaseList(items);
  expect(pl.lines).toHaveLength(0);
  expect(pl.unspecified).toHaveLength(items.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — module `@/lib/tailor-summary` not found.

- [ ] **Step 3: Implement** — `src/lib/tailor-summary.ts`

```ts
import { pieceKey } from "@/lib/costume-merge";

export interface PieceRow {
  costume_design_id: string;
  casting_id: string;
  source: "make" | "on_hand" | "shared";
  fabric_type: string | null;
  fabric_color: string | null;
  fabric_width: string | null;
  fabric_supplier: string | null;
  fabric_yardage: number | null;
  fabric_unit_cost: number | null;
  made: boolean;
}

export interface Fabric {
  type: string | null;
  color: string | null;
  width: string | null;
  supplier: string | null;
  yardage: number | null;
  unitCost: number | null;
}

export interface MakeItem {
  designId: string;
  castingId: string;
  performerName: string;
  castName: string;
  assignment: "primary" | "understudy";
  made: boolean;
  fabric: Fabric;
}

export interface WorklistGarment {
  designId: string;
  designName: string;
  items: MakeItem[];
}

export interface WorklistRole {
  roleId: string;
  roleName: string;
  notes: string | null;
  garments: WorklistGarment[];
}

export interface Worklist {
  roles: WorklistRole[];
  totalItems: number;
  madeItems: number;
}

export interface FabricLine {
  type: string;
  color: string | null;
  width: string | null;
  supplier: string | null;
  totalYardage: number;
  estCost: number;
  pieceCount: number;
}

export interface PurchaseList {
  lines: FabricLine[];
  unspecified: MakeItem[];
  totalYardage: number;
  totalCost: number;
}

interface RoleLike { id: string; name: string; notes: string | null }
interface DesignLike { id: string; role_id: string; name: string; display_order: number }
interface CastingLike { id: string; cast_id: string; role_id: string; performer_id: string; assignment: "primary" | "understudy" }
interface PerformerLike { id: string; name: string }
interface CastLike { id: string; name: string }

const EMPTY_FABRIC: Fabric = {
  type: null, color: null, width: null, supplier: null, yardage: null, unitCost: null,
};

function fabricFromRow(row: PieceRow | undefined): Fabric {
  if (!row) return EMPTY_FABRIC;
  return {
    type: row.fabric_type,
    color: row.fabric_color,
    width: row.fabric_width,
    supplier: row.fabric_supplier,
    yardage: row.fabric_yardage,
    unitCost: row.fabric_unit_cost,
  };
}

// Build the production-wide make worklist: for every (design × casting of that
// design's role, across all casts), include it unless its stored source is
// on_hand/shared. Absence of a row means "make" (the lazy default).
export function buildMakeWorklist(
  roles: RoleLike[],
  designs: DesignLike[],
  castings: CastingLike[],
  performers: PerformerLike[],
  casts: CastLike[],
  pieces: PieceRow[],
): Worklist {
  const pieceMap = new Map<string, PieceRow>();
  for (const p of pieces) pieceMap.set(pieceKey(p.casting_id, p.costume_design_id), p);
  const performerName = new Map(performers.map((p) => [p.id, p.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));

  let totalItems = 0;
  let madeItems = 0;
  const roleOut: WorklistRole[] = [];

  for (const role of roles) {
    const roleDesigns = designs
      .filter((d) => d.role_id === role.id)
      .sort((a, b) => a.display_order - b.display_order);
    const roleCastings = castings.filter((c) => c.role_id === role.id);
    const garments: WorklistGarment[] = [];

    for (const design of roleDesigns) {
      const items: MakeItem[] = [];
      for (const casting of roleCastings) {
        const row = pieceMap.get(pieceKey(casting.id, design.id));
        const source = row?.source ?? "make";
        if (source === "on_hand" || source === "shared") continue;
        const made = row?.made ?? false;
        items.push({
          designId: design.id,
          castingId: casting.id,
          performerName: performerName.get(casting.performer_id) ?? "—",
          castName: castName.get(casting.cast_id) ?? "—",
          assignment: casting.assignment,
          made,
          fabric: fabricFromRow(row),
        });
        totalItems += 1;
        if (made) madeItems += 1;
      }
      if (items.length > 0) garments.push({ designId: design.id, designName: design.name, items });
    }

    if (garments.length > 0) {
      roleOut.push({ roleId: role.id, roleName: role.name, notes: role.notes, garments });
    }
  }

  return { roles: roleOut, totalItems, madeItems };
}

function norm(s: string | null): string {
  return (s ?? "").trim();
}

// Aggregate make-items into a fabric shopping list, grouped by
// type+color+width+supplier. Items without a fabric type are "unspecified".
export function buildFabricPurchaseList(items: MakeItem[]): PurchaseList {
  const groups = new Map<string, FabricLine>();
  const unspecified: MakeItem[] = [];
  let totalYardage = 0;
  let totalCost = 0;

  for (const item of items) {
    const type = norm(item.fabric.type);
    if (!type) {
      unspecified.push(item);
      continue;
    }
    const color = norm(item.fabric.color);
    const width = norm(item.fabric.width);
    const supplier = norm(item.fabric.supplier);
    const key = [type, color, width, supplier].join("|");
    const yardage = item.fabric.yardage ?? 0;
    const cost = yardage * (item.fabric.unitCost ?? 0);

    const existing = groups.get(key);
    if (existing) {
      existing.totalYardage += yardage;
      existing.estCost += cost;
      existing.pieceCount += 1;
    } else {
      groups.set(key, {
        type,
        color: color || null,
        width: width || null,
        supplier: supplier || null,
        totalYardage: yardage,
        estCost: cost,
        pieceCount: 1,
      });
    }
    totalYardage += yardage;
    totalCost += cost;
  }

  return { lines: [...groups.values()], unspecified, totalYardage, totalCost };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat: tailor-summary worklist + fabric purchase-list helpers"
```

---

## Task 5: Extend the pieces API for fabric + made

**Files:**
- Modify: `src/app/api/productions/[id]/pieces/route.ts`
- Test: `src/app/api/productions/[id]/pieces/route.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `route.test.ts`

```ts
test("PUT forwards fabric + made fields", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make", made: true });
  const res = await PUT(
    put({
      designId: "d1", castingId: "c1", source: "make",
      fabricType: "wool", fabricColor: "navy", fabricWidth: '60"',
      fabricSupplier: "Mood", fabricYardage: 2.5, fabricUnitCost: 10, made: true,
    }),
    ctx("p1"),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({
      designId: "d1", castingId: "c1", source: "make",
      fabricType: "wool", fabricColor: "navy", fabricWidth: '60"',
      fabricSupplier: "Mood", fabricYardage: 2.5, fabricUnitCost: 10, made: true,
    }),
  );
});

test("PUT 400 on negative yardage", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", fabricYardage: -1 }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on non-boolean made", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", made: "yes" }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/route.test.ts"`
Expected: FAIL — fabric fields not forwarded; negative/non-boolean not rejected.

- [ ] **Step 3: Implement** — in `route.ts`, extend the `PUT` body type and add validation + forwarding.

Replace the body destructure type (`route.ts`, the `const body = (await request.json()) as { ... }` block) with:

```ts
    const body = (await request.json()) as {
      designId?: string;
      castingId?: string;
      source?: string;
      sharedWithCastingId?: string | null;
      sourceNote?: string | null;
      fabricType?: string | null;
      fabricColor?: string | null;
      fabricWidth?: string | null;
      fabricSupplier?: string | null;
      fabricYardage?: number | null;
      fabricUnitCost?: number | null;
      made?: boolean;
    };
```

Immediately after the existing `designId`/`castingId` string check (`route.ts`, right after the `throw new ValidationError("designId and castingId are required")` line's `if` block), add:

```ts
    const checkNum = (n: number | null | undefined, field: string) => {
      if (n === undefined || n === null) return;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
        throw new ValidationError(`${field} must be a number ≥ 0`);
      }
    };
    checkNum(body.fabricYardage, "Yardage");
    checkNum(body.fabricUnitCost, "Unit cost");
    if (body.made !== undefined && typeof body.made !== "boolean") {
      throw new ValidationError("made must be a boolean");
    }
```

Replace the `upsertPieceSource({ ... })` call with:

```ts
    const piece = await upsertPieceSource({
      designId: body.designId,
      castingId: body.castingId,
      source: body.source,
      sharedWithCastingId: body.sharedWithCastingId ?? null,
      sourceNote: body.sourceNote ?? null,
      fabricType: body.fabricType ?? null,
      fabricColor: body.fabricColor ?? null,
      fabricWidth: body.fabricWidth ?? null,
      fabricSupplier: body.fabricSupplier ?? null,
      fabricYardage: body.fabricYardage ?? null,
      fabricUnitCost: body.fabricUnitCost ?? null,
      made: body.made ?? false,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/route.test.ts"`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/pieces/route.ts" "src/app/api/productions/[id]/pieces/route.test.ts"
git commit -m "feat: accept fabric + made on PUT /pieces"
```

---

## Task 6: Client components — worklist, row, purchase list, container

No automated tests (the repo has no component-test harness; UI is verified via build + manual). Each component is verified by `npx tsc --noEmit` passing.

**Files:**
- Create: `src/components/MakePieceRow.tsx`
- Create: `src/components/MakeWorklist.tsx`
- Create: `src/components/FabricPurchaseList.tsx`
- Create: `src/components/TailorSummary.tsx`

- [ ] **Step 1: Create `src/components/MakePieceRow.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import type { MakeItem, PieceRow } from "@/lib/tailor-summary";

export function MakePieceRow({
  productionId,
  item,
  onSaved,
}: {
  productionId: string;
  item: MakeItem;
  onSaved: (piece: PieceRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState(item.made);
  const [type, setType] = useState(item.fabric.type ?? "");
  const [color, setColor] = useState(item.fabric.color ?? "");
  const [width, setWidth] = useState(item.fabric.width ?? "");
  const [supplier, setSupplier] = useState(item.fabric.supplier ?? "");
  const [yardage, setYardage] = useState(item.fabric.yardage != null ? String(item.fabric.yardage) : "");
  const [unitCost, setUnitCost] = useState(item.fabric.unitCost != null ? String(item.fabric.unitCost) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function save(nextMade = made) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        designId: item.designId,
        castingId: item.castingId,
        source: "make",
        fabricType: type.trim() || null,
        fabricColor: color.trim() || null,
        fabricWidth: width.trim() || null,
        fabricSupplier: supplier.trim() || null,
        fabricYardage: yardage.trim() === "" ? null : Number(yardage),
        fabricUnitCost: unitCost.trim() === "" ? null : Number(unitCost),
        made: nextMade,
      }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
      setBusy(false);
      inFlight.current = false;
      return;
    }
    const { piece } = (await res.json()) as { piece: PieceRow | null };
    onSaved(piece);
    setBusy(false);
    inFlight.current = false;
  }

  function toggleMade() {
    const next = !made;
    setMade(next);
    void save(next);
  }

  return (
    <li className="rounded-lg border border-[var(--field-line)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={made}
          onChange={toggleMade}
          aria-label={`Mark ${item.performerName}'s ${item.castName} piece made`}
          className="h-4 w-4 accent-[var(--red)]"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex flex-1 items-center gap-2 text-left text-sm ${made ? "muted line-through" : ""}`}
        >
          <span className="font-medium">{item.performerName}</span>
          <span className="text-xs muted">
            {item.castName}
            {item.assignment === "understudy" ? " · u/s" : ""}
          </span>
          {item.fabric.type && <span className="ml-auto text-xs muted">{item.fabric.type}</span>}
          <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        </button>
        {busy && <span className="text-xs muted">Saving…</span>}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          <Field label="Fabric" value={type} onChange={setType} onBlur={() => void save()} />
          <Field label="Color" value={color} onChange={setColor} onBlur={() => void save()} />
          <Field label="Width" value={width} onChange={setWidth} onBlur={() => void save()} placeholder={'e.g. 60"'} />
          <Field label="Yardage" value={yardage} onChange={setYardage} onBlur={() => void save()} inputMode="decimal" />
          <Field label="$/yd" value={unitCost} onChange={setUnitCost} onBlur={() => void save()} inputMode="decimal" />
          <Field label="Supplier" value={supplier} onChange={setSupplier} onBlur={() => void save()} />
          {error && <p className="col-span-full text-xs text-[var(--red)]">{error}</p>}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <input
        className="field !p-1.5 text-sm"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
```

- [ ] **Step 2: Create `src/components/MakeWorklist.tsx`**

```tsx
"use client";

import { MakePieceRow } from "@/components/MakePieceRow";
import type { Worklist, PieceRow } from "@/lib/tailor-summary";

export function MakeWorklist({
  productionId,
  worklist,
  onSaved,
}: {
  productionId: string;
  worklist: Worklist;
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  if (worklist.totalItems === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
        Nothing to make yet. Add costume pieces and mark them “Make”.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {worklist.roles.map((role) => (
        <section key={role.roleId} className="space-y-2">
          <h3 className="font-display text-lg font-semibold">{role.roleName}</h3>
          {role.notes && role.notes.trim() && (
            <p className="whitespace-pre-wrap text-sm muted">{role.notes}</p>
          )}
          {role.garments.map((g) => (
            <div key={g.designId} className="space-y-1">
              <p className="lbl">{g.designName}</p>
              <ul className="space-y-1">
                {g.items.map((item) => (
                  <MakePieceRow
                    key={`${g.designId}:${item.castingId}`}
                    productionId={productionId}
                    item={item}
                    onSaved={(piece) => onSaved(g.designId, item.castingId, piece)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/FabricPurchaseList.tsx`**

```tsx
"use client";

import type { PurchaseList } from "@/lib/tailor-summary";

function formatYards(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function FabricPurchaseList({ purchase }: { purchase: PurchaseList }) {
  if (purchase.lines.length === 0 && purchase.unspecified.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
        No fabric to buy yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {purchase.lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left muted">
              <th className="pb-1 font-normal">Fabric</th>
              <th className="pb-1 font-normal">Color</th>
              <th className="pb-1 font-normal">Width</th>
              <th className="pb-1 text-right font-normal">Yards</th>
              <th className="pb-1 text-right font-normal">Est. $</th>
              <th className="pb-1 font-normal">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((l, i) => (
              <tr key={i} className="border-t border-[var(--field-line)]">
                <td className="py-1.5">{l.type}</td>
                <td className="py-1.5">{l.color ?? "—"}</td>
                <td className="py-1.5">{l.width ?? "—"}</td>
                <td className="py-1.5 text-right">{formatYards(l.totalYardage)}</td>
                <td className="py-1.5 text-right">{l.estCost > 0 ? `$${l.estCost.toFixed(2)}` : "—"}</td>
                <td className="py-1.5">{l.supplier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--ink)] font-semibold">
              <td className="py-1.5" colSpan={3}>
                Total
              </td>
              <td className="py-1.5 text-right">{formatYards(purchase.totalYardage)}</td>
              <td className="py-1.5 text-right">
                {purchase.totalCost > 0 ? `$${purchase.totalCost.toFixed(2)}` : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {purchase.unspecified.length > 0 && (
        <div className="space-y-1">
          <p className="lbl">Fabric not specified yet ({purchase.unspecified.length})</p>
          <ul className="text-sm muted">
            {purchase.unspecified.map((it) => (
              <li key={`${it.designId}:${it.castingId}`}>
                {it.performerName} · {it.castName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/TailorSummary.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/Tabs";
import { MakeWorklist } from "@/components/MakeWorklist";
import { FabricPurchaseList } from "@/components/FabricPurchaseList";
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  type PieceRow,
} from "@/lib/tailor-summary";

interface Role { id: string; name: string; notes: string | null }
interface Design { id: string; role_id: string; name: string; display_order: number }
interface Casting { id: string; cast_id: string; role_id: string; performer_id: string; assignment: "primary" | "understudy" }
interface Performer { id: string; name: string }
interface Cast { id: string; name: string }

export function TailorSummary({
  productionId,
  roles,
  designs,
  castings,
  performers,
  casts,
  initialPieces,
}: {
  productionId: string;
  roles: Role[];
  designs: Design[];
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  initialPieces: PieceRow[];
}) {
  const [tab, setTab] = useState<"make" | "fabric">("make");
  const [pieces, setPieces] = useState<PieceRow[]>(initialPieces);

  const worklist = useMemo(
    () => buildMakeWorklist(roles, designs, castings, performers, casts, pieces),
    [roles, designs, castings, performers, casts, pieces],
  );
  const purchase = useMemo(() => {
    const items = worklist.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
    return buildFabricPurchaseList(items);
  }, [worklist]);

  // Reflect a saved piece into local state so both tabs stay live (or drop it
  // when the row was cleared back to the empty default).
  function applySaved(designId: string, castingId: string, piece: PieceRow | null) {
    setPieces((prev) => {
      const rest = prev.filter(
        (p) => !(p.costume_design_id === designId && p.casting_id === castingId),
      );
      return piece ? [...rest, piece] : rest;
    });
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          {
            id: "make",
            label: `To make${worklist.totalItems ? ` (${worklist.madeItems}/${worklist.totalItems})` : ""}`,
          },
          { id: "fabric", label: "Fabric list" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "make" | "fabric")}
      />
      {tab === "make" ? (
        <MakeWorklist productionId={productionId} worklist={worklist} onSaved={applySaved} />
      ) : (
        <FabricPurchaseList purchase={purchase} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/MakePieceRow.tsx src/components/MakeWorklist.tsx src/components/FabricPurchaseList.tsx src/components/TailorSummary.tsx
git commit -m "feat: tailor-summary client components"
```

---

## Task 7: Summary route page

**Files:**
- Create: `src/app/productions/[id]/summary/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
import { NotFoundError } from "@/lib/errors";
import { TailorSummary } from "@/components/TailorSummary";

export default async function TailorSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id } = await params;

  let production;
  try {
    production = await assertProductionInOrg(orgId, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [casts, roles, castings, performers] = await Promise.all([
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);
  const designs = await listCostumeDesigns(id);
  const pieces = await listCostumePieces(designs.map((d) => d.id));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/productions/${id}`} className="link-muted text-sm">
        ← {production.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold">Tailor’s summary</h1>
      <TailorSummary
        productionId={id}
        roles={roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes }))}
        designs={designs.map((d) => ({
          id: d.id,
          role_id: d.role_id,
          name: d.name,
          display_order: d.display_order,
        }))}
        castings={castings.map((c) => ({
          id: c.id,
          cast_id: c.cast_id,
          role_id: c.role_id,
          performer_id: c.performer_id,
          assignment: c.assignment,
        }))}
        performers={performers.map((p) => ({ id: p.id, name: p.label }))}
        casts={casts.map((c) => ({ id: c.id, name: c.name }))}
        initialPieces={pieces}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `listRoles` rows don't expose `notes`, confirm against `src/app/productions/[id]/page.tsx:113`, which already maps `notes: r.notes`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/productions/[id]/summary/page.tsx"
git commit -m "feat: tailor-summary route page"
```

---

## Task 8: Entry-point link on the production page

**Files:**
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Replace the Production Notes block**

Replace this block (`src/app/productions/[id]/page.tsx:106-108`):

```tsx
      <div className="mb-6">
        <ProductionNotes productionId={id} notes={production.notes} />
      </div>
```

with:

```tsx
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <ProductionNotes productionId={id} notes={production.notes} />
        </div>
        <Link
          href={`/productions/${id}/summary`}
          className="link-muted shrink-0 whitespace-nowrap text-sm"
        >
          Tailor’s summary →
        </Link>
      </div>
```

(`Link` is already imported at the top of this file.)

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/productions/[id]/page.tsx"
git commit -m "feat: link to tailor summary beside production notes"
```

---

## Task 9: Full verification

- [ ] **Step 1: Type-check, lint, full test suite, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tsc exit 0; lint no new errors (pre-existing `_t`/`_cols` warnings OK); all vitest tests pass (including the new Task 2/4/5 tests); build succeeds.

- [ ] **Step 2: Manual walkthrough** (requires migration `0011` applied to the dev Supabase project — gated on Chris)

  1. `npm run dev`, open a production with ≥1 cast member and ≥1 costume piece.
  2. Confirm the `Tailor's summary →` link sits right-aligned on the Production Notes row.
  3. Open it: the **To make** tab lists roles → garments → performers (all casts), excluding any piece marked On-hand/Shared in the Costume tab.
  4. Expand a row, fill fabric fields, blur — reload the page: values persist (row was materialized).
  5. Check **made** on a few rows — the count in the tab label updates (e.g. `To make (2/7)`); rows strike through.
  6. Switch to **Fabric list**: pieces with the same type/color/width/supplier merge into one line with summed yardage + est. cost; a grand total row shows; pieces with no fabric type appear under "Fabric not specified yet".
  7. Clear all fabric on a make row and uncheck made, blur — the row's DB record is removed (lazy default restored) but the item still shows in the worklist (it's still a make item).

- [ ] **Step 3: Final commit** (only if Step 1/2 surfaced fixes)

```bash
git add -A
git commit -m "fix: tailor-summary verification follow-ups"
```

---

## Self-Review notes (author)

- **Spec coverage:** entry point (Task 8), route (Task 7), data model 0011 (Task 1), revised delete rule (Tasks 2–3), extended API (Task 5), Tab 1 worklist + Tab 2 purchase list + made tracking (Tasks 4, 6), pure-helper tests (Tasks 2, 4), API tests (Task 5). All spec sections map to a task.
- **Type consistency:** `PieceRow`, `MakeItem`, `Worklist`, `PurchaseList`, `FabricLine` are defined once in `tailor-summary.ts` and imported everywhere. `upsertPieceSource` input field names (`fabricType`, …, `made`) match the API forwarding and the `MakePieceRow` request body. `pieceRowIsEmpty` field names match between Task 2 and its caller in Task 3.
- **Assumptions carried from spec:** all-casts scope; `fabric_unit_cost` = price per yard (line cost = yardage × unit cost); fabric grouping key = type+color+width+supplier; `made_at` set on each write (not surfaced in UI this pass).
```
