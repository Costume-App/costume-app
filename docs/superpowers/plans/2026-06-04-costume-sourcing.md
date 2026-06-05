# Costume Sourcing (Make / On-hand / Shared) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define each role's costume as garment pieces once, then mark how each performer obtains each piece (Make / On-hand / Shared), via a new tabbed production workspace.

**Architecture:** Two new tables (`costume_designs`, `costume_pieces`) with lazy "Make"-default piece rows. New data layers + API routes mirror the existing casts/castings conventions. The production detail page is refactored into a tabbed workspace (`Cast and Measurements` | `Costumes`) over a shared cast switcher and a collapsible-by-role roster. Pure merge/derive helpers keep sourcing logic unit-testable without DB mocks.

**Tech Stack:** Next 16 (App Router, RSC), TypeScript strict, Supabase (`supabaseAdmin` service role), Clerk auth, Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-costume-sourcing-design.md`

**Conventions to follow (from the existing codebase):**
- Data layer throws `ValidationError` / `NotFoundError` (`src/lib/errors.ts`); routes wrap with `errorResponse` (`src/lib/api.ts`).
- Routes: `getAuthContext()` → `assertProductionInOrg(orgId, id)` → query → `NextResponse.json`.
- Client fetches use `credentials: "include"`.
- Data-layer tests mock `@/lib/supabase-admin` with chained `vi.fn()`s (see `src/lib/data/casts.test.ts`). Route tests mock the data layer (see `src/app/api/productions/[id]/casts/[castId]/route.test.ts`).
- UI has **no component test harness** — UI tasks are verified by `npx tsc --noEmit`, `npx eslint <files>`, and a manual browser smoke pass (Clerk-gated, run by Chris on `localhost:3001`).
- **Do not start a background dev server**; Chris runs `npm run dev` himself.

---

## File Structure

**Create:**
- `supabase/migrations/0005_costume_sourcing.sql` — the two tables.
- `src/lib/costume-sources.ts` — source token/label constants (pure).
- `src/lib/costume-merge.ts` — pure derive helpers (`resolvePieceSources`, `pieceCountByRole`).
- `src/lib/costume-merge.test.ts`
- `src/lib/data/costume-designs.ts` + `.test.ts`
- `src/lib/data/costume-pieces.ts` + `.test.ts`
- `src/app/api/productions/[id]/designs/route.ts` (+ `route.test.ts`)
- `src/app/api/productions/[id]/designs/[designId]/route.ts` (+ `route.test.ts`)
- `src/app/api/productions/[id]/pieces/route.ts` (+ `route.test.ts`)
- `src/components/Tabs.tsx` — generic tab bar.
- `src/components/CollapsibleRole.tsx` — one-line collapsed header + expandable body.
- `src/components/ProductionWorkspace.tsx` — owns cast switcher + tab + collapse state.
- `src/components/RosterTab.tsx` — roster (extracted from `CastWorkspace`).
- `src/components/CostumesTab.tsx` — piece editor + source dropdowns + share picker.

**Modify:**
- `src/app/productions/[id]/page.tsx` — fetch designs/pieces, render `ProductionWorkspace`.

**Remove:**
- `src/components/CastWorkspace.tsx` — superseded by `ProductionWorkspace` + `RosterTab` (logic moves, not lost).

---

## Task 1: Migration — costume_designs + costume_pieces

**Files:**
- Create: `supabase/migrations/0005_costume_sourcing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-role costume pieces (the "design") and per-performer sourcing.

-- One garment in a character's costume, defined once per role.
create table if not exists costume_designs (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  name          text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists costume_designs_production_id_idx on costume_designs(production_id);
create index if not exists costume_designs_role_id_idx on costume_designs(role_id);

-- One performer's instance of a design, holding how they obtain it.
create table if not exists costume_pieces (
  id                   uuid primary key default gen_random_uuid(),
  costume_design_id    uuid not null references costume_designs(id) on delete cascade,
  casting_id           uuid not null references castings(id) on delete cascade,
  source               text not null default 'make' check (source in ('make','on_hand','shared')),
  shared_with_piece_id uuid references costume_pieces(id) on delete set null,
  source_note          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (costume_design_id, casting_id)
);
create index if not exists costume_pieces_design_id_idx on costume_pieces(costume_design_id);
create index if not exists costume_pieces_casting_id_idx on costume_pieces(casting_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

Run it in the Supabase SQL editor (same workflow as 0001–0004). Verify both tables and the `costume_pieces_source_check` constraint exist. **Confirm with Chris that it ran** before relying on it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_costume_sourcing.sql
git commit -m "feat(db): costume_designs + costume_pieces tables (migration 0005)"
```

---

## Task 2: Source constants module

**Files:**
- Create: `src/lib/costume-sources.ts`
- Test: `src/lib/costume-sources.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { COSTUME_SOURCES, sourceLabel, DEFAULT_SOURCE, isCostumeSource } from "@/lib/costume-sources";

test("sources expose token + label and a make default", () => {
  expect(DEFAULT_SOURCE).toBe("make");
  expect(COSTUME_SOURCES.map((s) => s.token)).toEqual(["make", "on_hand", "shared"]);
  expect(sourceLabel("on_hand")).toBe("On hand");
  expect(sourceLabel("nope")).toBe("Make"); // unknown falls back to default label
});

test("isCostumeSource guards the union", () => {
  expect(isCostumeSource("shared")).toBe(true);
  expect(isCostumeSource("borrow")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/costume-sources.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export type CostumeSource = "make" | "on_hand" | "shared";

export interface CostumeSourceOption {
  token: CostumeSource;
  label: string;
}

export const COSTUME_SOURCES: CostumeSourceOption[] = [
  { token: "make", label: "Make" },
  { token: "on_hand", label: "On hand" },
  { token: "shared", label: "Shared" },
];

export const DEFAULT_SOURCE: CostumeSource = "make";

export function isCostumeSource(value: string): value is CostumeSource {
  return COSTUME_SOURCES.some((s) => s.token === value);
}

export function sourceLabel(token: string): string {
  return COSTUME_SOURCES.find((s) => s.token === token)?.label ?? "Make";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/costume-sources.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costume-sources.ts src/lib/costume-sources.test.ts
git commit -m "feat: costume source constants"
```

---

## Task 3: Pure merge/derive helpers

These are pure functions — no Supabase. They turn (designs × castings × stored piece rows) into a per-(casting, design) source view defaulting to Make, and count pieces per role.

**Files:**
- Create: `src/lib/costume-merge.ts`
- Test: `src/lib/costume-merge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { resolvePieceSources, pieceCountByRole, pieceKey } from "@/lib/costume-merge";

const designs = [
  { id: "d1", role_id: "r1", name: "Jacket", display_order: 0 },
  { id: "d2", role_id: "r1", name: "Vest", display_order: 1 },
  { id: "d3", role_id: "r2", name: "Skirt", display_order: 0 },
];

test("pieceCountByRole counts designs per role", () => {
  expect(pieceCountByRole(designs)).toEqual({ r1: 2, r2: 1 });
});

test("resolvePieceSources defaults missing rows to make", () => {
  const map = resolvePieceSources([
    { id: "p1", costume_design_id: "d1", casting_id: "c1", source: "on_hand", shared_with_piece_id: null, source_note: "from closet" },
  ]);
  expect(map[pieceKey("c1", "d1")]).toEqual({ source: "on_hand", sharedWithPieceId: null, sourceNote: "from closet" });
  // not stored → caller treats as make; the map simply has no entry
  expect(map[pieceKey("c1", "d2")]).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/costume-merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
interface DesignLike {
  id: string;
  role_id: string;
}
interface PieceRowLike {
  costume_design_id: string;
  casting_id: string;
  source: "make" | "on_hand" | "shared";
  shared_with_piece_id: string | null;
  source_note: string | null;
}

export interface ResolvedSource {
  source: "make" | "on_hand" | "shared";
  sharedWithPieceId: string | null;
  sourceNote: string | null;
}

// Stable key for a (casting, design) cell.
export function pieceKey(castingId: string, designId: string): string {
  return `${castingId}:${designId}`;
}

// Stored rows only; absence means "make" (the caller defaults).
export function resolvePieceSources(pieces: PieceRowLike[]): Record<string, ResolvedSource> {
  const map: Record<string, ResolvedSource> = {};
  for (const p of pieces) {
    map[pieceKey(p.casting_id, p.costume_design_id)] = {
      source: p.source,
      sharedWithPieceId: p.shared_with_piece_id,
      sourceNote: p.source_note,
    };
  }
  return map;
}

export function pieceCountByRole(designs: DesignLike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of designs) counts[d.role_id] = (counts[d.role_id] ?? 0) + 1;
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/costume-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costume-merge.ts src/lib/costume-merge.test.ts
git commit -m "feat: pure costume merge/derive helpers"
```

---

## Task 4: costume-designs data layer

**Files:**
- Create: `src/lib/data/costume-designs.ts`
- Test: `src/lib/data/costume-designs.test.ts`

- [ ] **Step 1: Write the failing test** (mirror the chained-mock harness from `casts.test.ts`)

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const listEq = vi.fn(() => ({ order: order1 }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEqProd = vi.fn();
const deleteEqId = vi.fn(() => ({ eq: deleteEqProd }));
const del = vi.fn(() => ({ eq: deleteEqId }));
const updateMaybeSingle = vi.fn();
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEqProd = vi.fn(() => ({ select: updateSelect }));
const updateEqId = vi.fn(() => ({ eq: updateEqProd }));
const update = vi.fn(() => ({ eq: updateEqId }));
const select = vi.fn(() => ({ eq: listEq }));
const from = vi.fn(() => ({ select, insert, delete: del, update }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => from() } }));

import { listCostumeDesigns, createCostumeDesign, deleteCostumeDesign } from "@/lib/data/costume-designs";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEqProd, deleteEqId, del,
    updateMaybeSingle, updateSelect, updateEqProd, updateEqId, update, select, from].forEach((m) => m.mockReset());
  order1.mockReturnValue({ order: order2 });
  listEq.mockReturnValue({ order: order1 });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  deleteEqId.mockReturnValue({ eq: deleteEqProd });
  del.mockReturnValue({ eq: deleteEqId });
  updateSelect.mockReturnValue({ maybeSingle: updateMaybeSingle });
  updateEqProd.mockReturnValue({ select: updateSelect });
  updateEqId.mockReturnValue({ eq: updateEqProd });
  update.mockReturnValue({ eq: updateEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del, update });
});

test("listCostumeDesigns returns rows for a production", async () => {
  order2.mockResolvedValue({ data: [{ id: "d1" }], error: null });
  expect(await listCostumeDesigns("p1")).toEqual([{ id: "d1" }]);
});

test("createCostumeDesign trims and requires a name", async () => {
  await expect(createCostumeDesign({ productionId: "p1", roleId: "r1", name: "  " }))
    .rejects.toBeInstanceOf(ValidationError);
  insertSingle.mockResolvedValue({ data: { id: "d1", name: "Jacket" }, error: null });
  const row = await createCostumeDesign({ productionId: "p1", roleId: "r1", name: "  Jacket  " });
  expect(row).toEqual({ id: "d1", name: "Jacket" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", role_id: "r1", name: "Jacket" });
});

test("deleteCostumeDesign is scoped to the production", async () => {
  deleteEqProd.mockResolvedValue({ error: null });
  await deleteCostumeDesign("p1", "d1");
  expect(deleteEqId).toHaveBeenCalledWith("id", "d1");
  expect(deleteEqProd).toHaveBeenCalledWith("production_id", "p1");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/data/costume-designs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface CostumeDesign {
  id: string;
  production_id: string;
  role_id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export async function listCostumeDesigns(productionId: string): Promise<CostumeDesign[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumeDesign[];
}

export async function createCostumeDesign(input: {
  productionId: string;
  roleId: string;
  name: string;
}): Promise<CostumeDesign> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Piece name is required");
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .insert({ production_id: input.productionId, role_id: input.roleId, name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesign;
}

export async function updateCostumeDesign(
  productionId: string,
  id: string,
  name: string,
): Promise<CostumeDesign> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Piece name is required");
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Costume piece not found");
  return data as CostumeDesign;
}

export async function deleteCostumeDesign(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("costume_designs")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/data/costume-designs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-designs.ts src/lib/data/costume-designs.test.ts
git commit -m "feat: costume-designs data layer"
```

---

## Task 5: costume-pieces data layer

Holds: list pieces for a set of design ids; upsert a source (Make-with-no-note deletes the row); shared-source validation (same design, not self, no chain). The share-target lookup is a separate `.from().select().eq().maybeSingle()` chain.

**Files:**
- Create: `src/lib/data/costume-pieces.ts`
- Test: `src/lib/data/costume-pieces.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const listIn = vi.fn();          // .select("*").in(...)
const lookupMaybe = vi.fn();     // .select("id, source").eq().eq().maybeSingle()
const insertIdSingle = vi.fn();  // .insert(make target).select("id").single()
const upsertSingle = vi.fn();    // .upsert().select().single()
const delResolve = vi.fn();      // .delete().eq().eq()

const upsert = vi.fn(() => ({ select: () => ({ single: upsertSingle }) }));
const del = vi.fn(() => ({ eq: () => ({ eq: delResolve }) }));
const insert = vi.fn(() => ({ select: () => ({ single: insertIdSingle }) }));
const select = vi.fn((cols: string) =>
  cols === "*"
    ? { in: listIn }
    : { eq: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) },
);

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({ select, insert, upsert, delete: del }) },
}));

import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";

beforeEach(() => {
  [listIn, lookupMaybe, insertIdSingle, upsertSingle, delResolve, upsert, del, insert, select]
    .forEach((m) => m.mockReset());
  upsert.mockReturnValue({ select: () => ({ single: upsertSingle }) });
  del.mockReturnValue({ eq: () => ({ eq: delResolve }) });
  insert.mockReturnValue({ select: () => ({ single: insertIdSingle }) });
  select.mockImplementation((cols: string) =>
    cols === "*" ? { in: listIn } : { eq: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) },
  );
});

test("listCostumePieces returns [] for no designs without querying", async () => {
  expect(await listCostumePieces([])).toEqual([]);
});

test("make with no note deletes the row", async () => {
  delResolve.mockResolvedValue({ error: null });
  expect(await upsertPieceSource({ designId: "d1", castingId: "c1", source: "make" })).toBeNull();
  expect(del).toHaveBeenCalled();
});

test("on_hand upserts a row", async () => {
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "on_hand" }, error: null });
  const row = await upsertPieceSource({ designId: "d1", castingId: "c1", source: "on_hand", sourceNote: "closet" });
  expect(row).toEqual({ id: "p1", source: "on_hand" });
  expect(upsert).toHaveBeenCalledWith(
    { costume_design_id: "d1", casting_id: "c1", source: "on_hand", shared_with_piece_id: null, source_note: "closet", updated_at: expect.any(String) },
    { onConflict: "costume_design_id,casting_id" },
  );
});

test("shared requires a target and rejects self", async () => {
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared" }))
    .rejects.toBeInstanceOf(ValidationError);
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c1" }))
    .rejects.toBeInstanceOf(ValidationError);
});

test("shared links to an existing make target", async () => {
  lookupMaybe.mockResolvedValue({ data: { id: "pT", source: "make" }, error: null });
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "shared" }, error: null });
  await upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ source: "shared", shared_with_piece_id: "pT" }),
    { onConflict: "costume_design_id,casting_id" },
  );
});

test("shared rejects a target that is itself shared (no chains)", async () => {
  lookupMaybe.mockResolvedValue({ data: { id: "pT", source: "shared" }, error: null });
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" }))
    .rejects.toBeInstanceOf(ValidationError);
});

test("shared creates the target row as make when missing", async () => {
  lookupMaybe.mockResolvedValue({ data: null, error: null });
  insertIdSingle.mockResolvedValue({ data: { id: "pNew" }, error: null });
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "shared" }, error: null });
  await upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" });
  expect(insert).toHaveBeenCalledWith({ costume_design_id: "d1", casting_id: "c2", source: "make" });
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ shared_with_piece_id: "pNew" }), expect.anything());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import type { CostumeSource } from "@/lib/costume-sources";

export interface CostumePiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  shared_with_piece_id: string | null;
  source_note: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCostumePieces(designIds: string[]): Promise<CostumePiece[]> {
  if (designIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("costume_pieces")
    .select("*")
    .in("costume_design_id", designIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumePiece[];
}

// OPTION 1: the borrower references the target *performer* (casting), and we
// ensure that performer's piece row exists (creating it as `make` if missing),
// then store its piece id. Rejects sharing from a piece that is itself shared.
// Returns the target piece's id.
async function ensureShareTarget(designId: string, targetCastingId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("id, source")
    .eq("costume_design_id", designId)
    .eq("casting_id", targetCastingId)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (existing) {
    const row = existing as { id: string; source: CostumeSource };
    if (row.source === "shared") throw new ValidationError("Cannot share a piece that is itself shared");
    return row.id;
  }
  const { data: created, error: insErr } = await supabaseAdmin
    .from("costume_pieces")
    .insert({ costume_design_id: designId, casting_id: targetCastingId, source: "make" })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return (created as { id: string }).id;
}

// Upsert a performer's source for a design. `make` with no note clears the row
// (lazy default). For `shared`, references the borrowed *performer* (casting).
// Returns the row, or null when cleared.
export async function upsertPieceSource(input: {
  designId: string;
  castingId: string;
  source: CostumeSource;
  sharedWithCastingId?: string | null;
  sourceNote?: string | null;
}): Promise<CostumePiece | null> {
  const note = input.sourceNote?.trim() ? input.sourceNote.trim() : null;

  if (input.source === "make" && !note) {
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

> Note: the test's `supabaseAdmin` mock routes `.select("*")` to the list chain and `.select("id, source")` to the share-target lookup chain (`.eq().eq().maybeSingle()`); `.insert().select("id").single()` creates a missing target. Keep those select-strings exact so the mock matches.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-pieces.ts src/lib/data/costume-pieces.test.ts
git commit -m "feat: costume-pieces data layer with share validation"
```

---

## Task 6: Designs API routes

Reuse the existing `assertProductionInOrg` (and a new same-pattern check that a role belongs to the production). Two route files.

**Files:**
- Create: `src/app/api/productions/[id]/designs/route.ts` (GET list, POST create)
- Create: `src/app/api/productions/[id]/designs/[designId]/route.ts` (PATCH, DELETE)
- Test: `src/app/api/productions/[id]/designs/route.test.ts`

- [ ] **Step 1: Write the failing test** (mock the data layer + auth, like the casts route test)

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));
const listCostumeDesigns = vi.fn();
const createCostumeDesign = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({
  listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a),
  createCostumeDesign: (...a: unknown[]) => createCostumeDesign(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/designs/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listCostumeDesigns, createCostumeDesign].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

test("GET lists designs (200)", async () => {
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
  const res = await GET(new Request("http://t"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ designs: [{ id: "d1" }] });
});

test("POST creates a design (201)", async () => {
  createCostumeDesign.mockResolvedValue({ id: "d1", name: "Jacket" });
  const res = await POST(post({ roleId: "r1", name: "Jacket" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createCostumeDesign).toHaveBeenCalledWith({ productionId: "p1", roleId: "r1", name: "Jacket" });
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(post({ roleId: "r1", name: "X" }), ctx("p1"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/productions/[id]/designs/route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the list/create route**

`src/app/api/productions/[id]/designs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCostumeDesigns, createCostumeDesign } from "@/lib/data/costume-designs";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const designs = await listCostumeDesigns(id);
    return NextResponse.json({ designs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { roleId?: string; name?: string };
    if (typeof body.roleId !== "string" || !body.roleId) throw new ValidationError("roleId is required");
    const design = await createCostumeDesign({
      productionId: id,
      roleId: body.roleId,
      name: typeof body.name === "string" ? body.name : "",
    });
    return NextResponse.json({ design }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Implement the PATCH/DELETE route**

`src/app/api/productions/[id]/designs/[designId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { updateCostumeDesign, deleteCostumeDesign } from "@/lib/data/costume-designs";

type Ctx = { params: Promise<{ id: string; designId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string };
    const design = await updateCostumeDesign(id, designId, typeof body.name === "string" ? body.name : "");
    return NextResponse.json({ design });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteCostumeDesign(id, designId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run tests + tsc + lint**

Run: `npx vitest run src/app/api/productions/[id]/designs/route.test.ts && npx tsc --noEmit && npx eslint "src/app/api/productions/[id]/designs/**"`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/productions/[id]/designs"
git commit -m "feat: costume designs API routes"
```

---

## Task 7: Pieces API route (upsert source)

**Files:**
- Create: `src/app/api/productions/[id]/pieces/route.ts` (GET list, PUT upsert)
- Test: `src/app/api/productions/[id]/pieces/route.test.ts`

The PUT validates `source` against `isCostumeSource`, and that the design + casting belong to the production (use the existing `assertProductionInOrg`, plus list the production's designs and confirm `designId` is among them; confirm the casting via a new `assertCastingInProduction` helper — see Step 3a).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
const assertCastingInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertCastingInProduction: (...a: unknown[]) => assertCastingInProduction(...a),
}));
const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));
const listCostumePieces = vi.fn();
const upsertPieceSource = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  upsertPieceSource: (...a: unknown[]) => upsertPieceSource(...a),
}));

import { PUT } from "@/app/api/productions/[id]/pieces/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) =>
  new Request("http://t", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertCastingInProduction, listCostumeDesigns, listCostumePieces, upsertPieceSource].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertCastingInProduction.mockResolvedValue(undefined);
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
});

test("PUT upserts a piece source (200)", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "on_hand" });
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "on_hand" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith({
    designId: "d1", castingId: "c1", source: "on_hand", sharedWithCastingId: null, sourceNote: null,
  });
});

test("PUT 400 on unknown source", async () => {
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "borrow" }), ctx("p1"));
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 when design not in production", async () => {
  listCostumeDesigns.mockResolvedValue([{ id: "dX" }]);
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "make" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/productions/[id]/pieces/route.test.ts`
Expected: FAIL — route + `assertCastingInProduction` not found.

- [ ] **Step 3a: Add `assertCastingInProduction` to production-access**

In `src/lib/data/production-access.ts`, add (mirroring the existing `assertPerformerInOrg`/`assertProductionInOrg` style — read the file first to match its exact imports/return conventions):

```ts
// Throws NotFoundError unless the casting belongs to the given production.
export async function assertCastingInProduction(productionId: string, castingId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("castings")
    .select("id")
    .eq("id", castingId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Casting not found in this production");
}
```

> Verify `castings` has `production_id` (migration 0003/0004). If it does not, instead join through `casts`: `.select("id, casts!inner(production_id)").eq("id", castingId).eq("casts.production_id", productionId)`. Check the schema before choosing.

- [ ] **Step 3b: Implement the route**

`src/app/api/productions/[id]/pieces/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertCastingInProduction } from "@/lib/data/production-access";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";
import { isCostumeSource } from "@/lib/costume-sources";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const designs = await listCostumeDesigns(id);
    const pieces = await listCostumePieces(designs.map((d) => d.id));
    return NextResponse.json({ pieces });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      designId?: string;
      castingId?: string;
      source?: string;
      sharedWithCastingId?: string | null;
      sourceNote?: string | null;
    };
    if (typeof body.source !== "string" || !isCostumeSource(body.source)) {
      throw new ValidationError("Invalid source");
    }
    if (typeof body.designId !== "string" || typeof body.castingId !== "string") {
      throw new ValidationError("designId and castingId are required");
    }
    const designs = await listCostumeDesigns(id);
    if (!designs.some((d) => d.id === body.designId)) {
      throw new ValidationError("Piece is not part of this production");
    }
    await assertCastingInProduction(id, body.castingId);
    // Shared target must also be a casting in this production (IDOR guard).
    if (body.source === "shared" && body.sharedWithCastingId) {
      await assertCastingInProduction(id, body.sharedWithCastingId);
    }

    const piece = await upsertPieceSource({
      designId: body.designId,
      castingId: body.castingId,
      source: body.source,
      sharedWithCastingId: body.sharedWithCastingId ?? null,
      sourceNote: body.sourceNote ?? null,
    });
    return NextResponse.json({ piece });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run tests + tsc + lint**

Run: `npx vitest run src/app/api/productions/[id]/pieces/route.test.ts && npx tsc --noEmit`
Expected: PASS / clean. (If `assertCastingInProduction` needed the `casts` join, re-run the data-layer tests too.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/pieces" src/lib/data/production-access.ts
git commit -m "feat: costume pieces API (source upsert) + casting-in-production guard"
```

---

## Task 8: Generic Tabs + CollapsibleRole components

No unit tests (no component harness). Verified by tsc/lint + later manual smoke.

**Files:**
- Create: `src/components/Tabs.tsx`
- Create: `src/components/CollapsibleRole.tsx`

- [ ] **Step 1: Implement `Tabs.tsx`**

```tsx
"use client";

export interface TabDef {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--field-line)]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 px-1 pb-2 pt-1 text-sm font-semibold ${
              on ? "border-[var(--red)] text-[var(--red)]" : "border-transparent text-[var(--muted)]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `CollapsibleRole.tsx`**

```tsx
"use client";

import { useState } from "react";

// One collapsible role card. Collapsed = a single summary line; expanded shows children.
// `tint`/`edge` style the card with the active cast's color.
export function CollapsibleRole({
  title,
  summary,
  defaultOpen = false,
  tint,
  edge,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  tint: string;
  edge: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="surface p-0" style={{ backgroundColor: tint, borderColor: edge }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        <span className="font-display text-lg font-semibold">{title}</span>
        {!open && summary != null && <span className="ml-auto text-xs muted">{summary}</span>}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </li>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/Tabs.tsx src/components/CollapsibleRole.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/Tabs.tsx src/components/CollapsibleRole.tsx
git commit -m "feat: generic Tabs + CollapsibleRole components"
```

---

## Task 9: ProductionWorkspace + RosterTab (refactor CastWorkspace)

Move the cast switcher + tab state + role-collapse state into `ProductionWorkspace`; move the existing role/casting/measurement UI into `RosterTab`, now rendered inside `CollapsibleRole` (default collapsed). **All current `CastWorkspace` behavior is preserved** (add/rename/recolor/delete cast, add role, add/remove primary & understudies, measurement dots, name-as-link, color tint).

**Files:**
- Create: `src/components/ProductionWorkspace.tsx`
- Create: `src/components/RosterTab.tsx`
- Modify: `src/app/productions/[id]/page.tsx`
- Delete: `src/components/CastWorkspace.tsx` (after parity confirmed)

- [ ] **Step 1: Read the current component**

Read `src/components/CastWorkspace.tsx` in full. The new `ProductionWorkspace` keeps its props/state for casts/roles/castings/measurementStatus and the cast CRUD handlers (`addCast`, `renameCast`, `deleteCast`), the cast switcher JSX, `ColorSwatches`, `MeasurementDot`, `castColorTint/Edge`, `selectedColor`. The role list moves into `RosterTab` and the per-role card becomes a `CollapsibleRole`.

- [ ] **Step 2: Create `ProductionWorkspace.tsx`**

It receives all the data the page currently passes to `CastWorkspace`, **plus** `initialDesigns` and `initialPieces` (forwarded to `CostumesTab` in Task 10). It owns: `casts` state + cast CRUD, `selectedCastId`, `tab` state (`"roster" | "costumes"`), `selectedColor`, and renders the cast switcher, `<Tabs>`, then the active tab.

```tsx
"use client";

import { useState } from "react";
import { Tabs } from "@/components/Tabs";
import { RosterTab } from "@/components/RosterTab";
import { CostumesTab } from "@/components/CostumesTab";
import {
  CAST_COLORS, castColorHex, castColorTint, castColorEdge, DEFAULT_CAST_COLOR,
} from "@/lib/cast-colors";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";

export type MeasureStatus = "none" | "partial" | "complete";
export interface Cast { id: string; name: string; color: string }
export interface Role { id: string; name: string }
export interface Performer { id: string; name: string }
export interface Casting {
  id: string; castId: string; roleId: string; performerId: string; assignment: "primary" | "understudy";
}

export function ProductionWorkspace(props: {
  productionId: string;
  initialCasts: Cast[];
  initialRoles: Role[];
  initialPerformers: Performer[];
  initialCastings: Casting[];
  measurementStatus: Record<string, MeasureStatus>;
  initialDesigns: CostumeDesign[];
  initialPieces: CostumePiece[];
}) {
  const [casts, setCasts] = useState<Cast[]>(props.initialCasts);
  const [selectedCastId, setSelectedCastId] = useState<string>(props.initialCasts[0]?.id ?? "");
  const [tab, setTab] = useState<"roster" | "costumes">("roster");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedColor = casts.find((c) => c.id === selectedCastId)?.color ?? DEFAULT_CAST_COLOR;
  const tint = castColorTint(selectedColor);
  const edge = castColorEdge(selectedColor);

  // ---- cast CRUD: copy addCast / renameCast / deleteCast verbatim from CastWorkspace,
  //      including newCast/newCastColor/showAddCast/showRenameCast/renameValue/renameColor state. ----
  // (Omitted here for brevity in the plan — MOVE the exact handlers + the cast-switcher JSX
  //  block and the ColorSwatches/PencilIcon helpers from CastWorkspace into this file.)

  return (
    <div className="space-y-5">
      {/* cast switcher JSX moved from CastWorkspace */}
      <Tabs
        tabs={[{ id: "roster", label: "Cast and Measurements" }, { id: "costumes", label: "Costumes" }]}
        active={tab}
        onChange={(id) => setTab(id as "roster" | "costumes")}
      />
      {tab === "roster" ? (
        <RosterTab
          productionId={props.productionId}
          selectedCastId={selectedCastId}
          roles={props.initialRoles}
          performers={props.initialPerformers}
          castings={props.initialCastings}
          measurementStatus={props.measurementStatus}
          tint={tint}
          edge={edge}
        />
      ) : (
        <CostumesTab
          productionId={props.productionId}
          selectedCastId={selectedCastId}
          roles={props.initialRoles}
          castings={props.initialCastings}
          performers={props.initialPerformers}
          casts={casts}
          initialDesigns={props.initialDesigns}
          initialPieces={props.initialPieces}
          tint={tint}
          edge={edge}
        />
      )}
      {error && <p className="text-[var(--red)]">{error}</p>}
    </div>
  );
}
```

> Implementation note: the cast CRUD handlers and switcher JSX, plus `ColorSwatches`/`PencilIcon`, are **moved unchanged** from `CastWorkspace`. `setBusy`/`setError` are shared; keep them here. RosterTab manages its own role/casting state (Step 3).

- [ ] **Step 3: Create `RosterTab.tsx`**

Holds the role/casting state + handlers (`addRole`, `addCastMember`, `removeCastMember`) and the `AddName`/`CastLink`/`MeasurementDot` helpers — all **moved from CastWorkspace**. Each role renders inside `<CollapsibleRole defaultOpen={false}>` with summary = primary name.

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { CollapsibleRole } from "@/components/CollapsibleRole";
import type { MeasureStatus, Role, Performer, Casting } from "@/components/ProductionWorkspace";

export function RosterTab(props: {
  productionId: string;
  selectedCastId: string;
  roles: Role[];
  performers: Performer[];
  castings: Casting[];
  measurementStatus: Record<string, MeasureStatus>;
  tint: string;
  edge: string;
}) {
  const [roles, setRoles] = useState<Role[]>(props.roles);
  const [performers, setPerformers] = useState<Performer[]>(props.performers);
  const [castings, setCastings] = useState<Casting[]>(props.castings);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => performers.find((p) => p.id === id)?.name ?? "";
  const statusOf = (id: string): MeasureStatus => props.measurementStatus[id] ?? "none";
  const inSelectedCast = castings.filter((c) => c.castId === props.selectedCastId);

  // MOVE addRole / addCastMember / removeCastMember verbatim from CastWorkspace.
  // MOVE AddName, CastLink, MeasurementDot helpers (bottom of CastWorkspace) into this file.

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Roles &amp; Cast</h2>
      {roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
          No roles yet. Add the first character below.
        </p>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => {
            const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
            const primary = forRole.find((c) => c.assignment === "primary");
            const understudies = forRole.filter((c) => c.assignment === "understudy");
            return (
              <CollapsibleRole
                key={r.id}
                title={r.name}
                summary={primary ? nameOf(primary.performerId) : "—"}
                tint={props.tint}
                edge={props.edge}
              >
                {/* MOVE the primary + understudies block (CastLink / AddName usage) from CastWorkspace here */}
              </CollapsibleRole>
            );
          })}
        </ul>
      )}
      {/* MOVE the add-role form from CastWorkspace here */}
      {error && <p className="text-[var(--red)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Update the page to render ProductionWorkspace**

In `src/app/productions/[id]/page.tsx`, replace the `CastWorkspace` import/usage with `ProductionWorkspace`, passing the same props plus `initialDesigns={[]}` and `initialPieces={[]}` for now (Task 10 wires real data).

```tsx
import { ProductionWorkspace } from "@/components/ProductionWorkspace";
// ...
<ProductionWorkspace
  productionId={id}
  initialCasts={casts.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
  initialRoles={roles.map((r) => ({ id: r.id, name: r.name }))}
  initialPerformers={performers.map((p) => ({ id: p.id, name: p.label }))}
  initialCastings={castings.map((c) => ({
    id: c.id, castId: c.cast_id, roleId: c.role_id, performerId: c.performer_id, assignment: c.assignment,
  }))}
  measurementStatus={measurementStatus}
  initialDesigns={[]}
  initialPieces={[]}
/>
```

- [ ] **Step 5: Delete CastWorkspace and verify**

```bash
git rm src/components/CastWorkspace.tsx
```

Run: `npx tsc --noEmit && npx eslint src/components/ProductionWorkspace.tsx src/components/RosterTab.tsx "src/app/productions/[id]/page.tsx" && npx vitest run`
Expected: tsc/lint clean; all existing tests pass.

- [ ] **Step 6: Manual smoke (Chris, browser)**

On `localhost:3001` → a production: the Cast and Measurements tab shows; roles are collapsed by default; expanding shows primary/understudies; add/rename/recolor/delete cast still work; measurement dots + name links intact; color tint follows the cast.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: tabbed ProductionWorkspace + collapsible RosterTab (replaces CastWorkspace)"
```

---

## Task 10: CostumesTab — piece editor + source dropdowns + share picker

**Files:**
- Create: `src/components/CostumesTab.tsx`
- Modify: `src/app/productions/[id]/page.tsx` (fetch + pass designs/pieces)

- [ ] **Step 1: Wire server data**

In `src/app/productions/[id]/page.tsx`, fetch designs + pieces and pass them:

```tsx
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
// after fetching roles/castings/etc:
const designs = await listCostumeDesigns(id);
const pieces = await listCostumePieces(designs.map((d) => d.id));
// pass: initialDesigns={designs} initialPieces={pieces}
```

- [ ] **Step 2: Implement `CostumesTab.tsx`**

Per role: a `CollapsibleRole` (summary = `${primaryName} · ${pieceCount} pieces`). Header has a "edit" toggle to add/delete the role's designs. Body lists each performer (in selected cast) with each design and a source `<select>`. Choosing Shared reveals a second `<select>` of other castings' pieces of the same design. State: `designs`, `pieces` (array of stored rows), updated via fetch.

```tsx
"use client";

import { useState } from "react";
import { CollapsibleRole } from "@/components/CollapsibleRole";
import { COSTUME_SOURCES, DEFAULT_SOURCE } from "@/lib/costume-sources";
import { resolvePieceSources, pieceCountByRole, pieceKey } from "@/lib/costume-merge";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";
import type { Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

export function CostumesTab(props: {
  productionId: string;
  selectedCastId: string;
  roles: Role[];
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  initialDesigns: CostumeDesign[];
  initialPieces: CostumePiece[];
  tint: string;
  edge: string;
}) {
  const [designs, setDesigns] = useState<CostumeDesign[]>(props.initialDesigns);
  const [pieces, setPieces] = useState<CostumePiece[]>(props.initialPieces);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => props.performers.find((p) => p.id === performerId)?.name ?? "";
  const castNameOf = (castId: string) => props.casts.find((c) => c.id === castId)?.name ?? "";
  const sources = resolvePieceSources(pieces);
  const counts = pieceCountByRole(designs);
  const inSelectedCast = props.castings.filter((c) => c.castId === props.selectedCastId);

  async function addDesign(roleId: string, name: string) {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/productions/${props.productionId}/designs`, {
      method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
      body: JSON.stringify({ roleId, name }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => [...prev, design]);
    } else setError("Couldn't add piece");
    setBusy(false);
  }

  async function removeDesign(designId: string) {
    if (!confirm("Remove this piece from the costume? Removes it for every performer.")) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/productions/${props.productionId}/designs/${designId}`, {
      method: "DELETE", credentials: "include",
    });
    if (res.ok) {
      setDesigns((prev) => prev.filter((d) => d.id !== designId));
      setPieces((prev) => prev.filter((p) => p.costume_design_id !== designId));
    } else setError("Couldn't remove piece");
    setBusy(false);
  }

  async function setSource(designId: string, castingId: string, source: string, sharedWithCastingId: string | null) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/productions/${props.productionId}/pieces`, {
      method: "PUT", headers: { "content-type": "application/json" }, credentials: "include",
      body: JSON.stringify({ designId, castingId, source, sharedWithCastingId }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: CostumePiece | null };
      setPieces((prev) => {
        const without = prev.filter((p) => !(p.costume_design_id === designId && p.casting_id === castingId));
        return piece ? [...without, piece] : without;
      });
    } else {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(msg ?? "Couldn't update source");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Costumes</h2>
      {props.roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
          Add roles on the Cast and Measurements tab first.
        </p>
      ) : (
        <ul className="space-y-3">
          {props.roles.map((r) => {
            const roleDesigns = designs.filter((d) => d.role_id === r.id);
            const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
            const primary = forRole.find((c) => c.assignment === "primary");
            const ordered = [
              ...(primary ? [primary] : []),
              ...forRole.filter((c) => c.assignment === "understudy"),
            ];
            return (
              <CollapsibleRole
                key={r.id}
                title={r.name}
                summary={`${primary ? nameOf(primary.performerId) : "—"} · ${counts[r.id] ?? 0} pieces`}
                tint={props.tint}
                edge={props.edge}
              >
                <PieceEditor roleId={r.id} designs={roleDesigns} onAdd={addDesign} onRemove={removeDesign} busy={busy} />
                {ordered.length === 0 ? (
                  <p className="text-sm muted">No one cast in this role yet.</p>
                ) : ordered.map((casting) => (
                  <div key={casting.id} className="surface !shadow-none p-3">
                    <div className="mb-1 font-medium">
                      {nameOf(casting.performerId)}
                      {casting.assignment === "understudy" && <span className="muted text-sm"> · Understudy</span>}
                    </div>
                    {roleDesigns.length === 0 ? (
                      <p className="text-sm muted">No pieces defined.</p>
                    ) : roleDesigns.map((d) => {
                      const resolved = sources[pieceKey(casting.id, d.id)];
                      const source = resolved?.source ?? DEFAULT_SOURCE;
                      // current shared-with casting: map the stored target piece id back to its casting
                      const sharedCastingId = resolved?.sharedWithPieceId
                        ? pieces.find((p) => p.id === resolved.sharedWithPieceId)?.casting_id ?? ""
                        : "";
                      // share candidates: other performers cast in THIS role, any cast
                      const shareCandidates = props.castings.filter((c) => c.roleId === r.id && c.id !== casting.id);
                      return (
                        <div key={d.id} className="flex flex-wrap items-center gap-2 py-1">
                          <span className="flex-1">{d.name}</span>
                          <select
                            className="field !p-1.5 text-sm"
                            value={source}
                            disabled={busy}
                            onChange={(e) => setSource(d.id, casting.id, e.target.value, null)}
                          >
                            {COSTUME_SOURCES.map((s) => (
                              <option key={s.token} value={s.token}>{s.label}</option>
                            ))}
                          </select>
                          {source === "shared" && (
                            <select
                              className="field !p-1.5 text-sm"
                              value={sharedCastingId}
                              disabled={busy}
                              onChange={(e) => setSource(d.id, casting.id, "shared", e.target.value || null)}
                            >
                              <option value="">Whose?</option>
                              {shareCandidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {nameOf(c.performerId)} ({castNameOf(c.castId)})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CollapsibleRole>
            );
          })}
        </ul>
      )}
      {error && <p className="text-[var(--red)]">{error}</p>}
    </div>
  );
}

function PieceEditor({
  roleId, designs, onAdd, onRemove, busy,
}: {
  roleId: string;
  designs: CostumeDesign[];
  onAdd: (roleId: string, name: string) => void;
  onRemove: (designId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="mb-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="lbl">Pieces</span>
        {designs.map((d) => (
          <span key={d.id} className="chip">
            {d.name}
            <button type="button" aria-label={`Remove ${d.name}`} disabled={busy}
              onClick={() => onRemove(d.id)} className="ml-1 text-[var(--red)]">×</button>
          </span>
        ))}
        {open ? (
          <form
            onSubmit={(e) => { e.preventDefault(); onAdd(roleId, name); setName(""); setOpen(false); }}
            className="inline-flex items-center gap-1.5"
          >
            <input autoFocus className="field w-28 !p-1.5 text-sm" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Piece name" />
            <button type="submit" disabled={busy} className="btn-ghost text-sm">Add</button>
            <button type="button" onClick={() => { setOpen(false); setName(""); }} className="link-muted text-sm">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">+ add</button>
        )}
      </div>
    </div>
  );
}
```

> **Share-target referencing — Option 1 (DECIDED).** The picker sends the borrowed **casting id** (`sharedWithCastingId`); the server (`upsertPieceSource` → `ensureShareTarget`, Task 5) looks up or creates that performer's piece row (as `make`) and stores its id in `shared_with_piece_id`. So you can share from anyone, even someone still on default Make. The picker's current selection is derived by mapping the stored target piece id back to its casting (`sharedCastingId` above). This is already baked into Tasks 5 and 7 — no further decision needed.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/CostumesTab.tsx "src/app/productions/[id]/page.tsx" && npx vitest run`
Expected: clean; all tests pass.

- [ ] **Step 4: Manual smoke (Chris, browser)**

On the Costumes tab: roles collapsed with "primary · N pieces"; expand → add pieces (Jacket/Trousers/Vest); each performer shows a source dropdown; set On-hand/Shared and confirm it persists across a refresh; switch casts and confirm per-cast performers; delete a piece and confirm it clears for everyone.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Costumes tab — per-role pieces + per-performer sourcing"
```

---

## Task 11: Update memory + roadmap

- [ ] **Step 1: Update project memory**

In `~/.claude/projects/.../memory/project-overview.md`: add an "M3 Slice 1 (costume sourcing) — DONE" note (tables 0005, tabbed workspace, sourcing UI), and move "cast color picker" / sourcing off the open roadmap. Record the share-target decision (option 1 vs 2) actually taken.

- [ ] **Step 2: Final full check**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: clean; all tests green.

---

## Self-Review notes (author)

- **Spec §2 UX** → Tasks 8–10 (tabs, collapsible default-collapsed, name-as-link preserved in RosterTab, Costumes dropdowns).
- **Spec §3 data model** → Task 1 (tables), Tasks 4–5 (layers), lazy-Make in `upsertPieceSource` (Task 5) + `resolvePieceSources` (Task 3).
- **Spec §4 sharing** → Option 1 (decided): Task 5 `ensureShareTarget` (ensure-or-create target row, self/chain guards) + Task 7 target-casting IDOR guard + Task 10 picker keyed by casting id.
- **Spec §5 API** → Tasks 6–7; IDOR guards via `assertProductionInOrg` + `assertCastingInProduction` + design-in-production check.
- **Spec §6 components** → Tasks 8–10 (ProductionWorkspace / RosterTab / CostumesTab / CollapsibleRole; source constants module).
- **Spec §7 testing** → data-layer + route + pure-helper tests in Tasks 2–7.
- **Spec §8 designed-for** → not built (correct); generic `Tabs` (Task 8) keeps the Materials tab cheap.
- **Share-target referencing:** resolved to Option 1 (casting-id, server-ensures) and baked into Tasks 5/7/10 — no open decisions remain.
