# Costume App — Milestone 2 · Slice 3: Multiple Casts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a production have multiple named, colored **casts** (e.g. Gold / Blue), with each role's primary + understudies assigned **per cast**, switchable on the production detail page.

**Architecture:** Adds a `casts` table and a `cast_id` on `castings`. A migration auto-creates one default cast per existing production and backfills current castings to it. The detail page becomes a `CastWorkspace`: a cast switcher on top, the (cast-independent) role list below, and each role's primary/understudy resolved for the selected cast. The casting write path now validates the role and cast belong to the production (closing a deferred ownership gap). Data layer + routes unit-tested; UI verified by running the app.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Tailwind 4, Clerk, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-costume-app-design.md` — §4 (`casts`, `castings.cast_id`), §7 (cast switcher: roles × casts). Builds on Slice 2 (roles + castings, single implicit cast).

> **Migration:** run `0004_casts.sql` in Supabase (after 0003). It creates `casts`, a default cast per production, adds `castings.cast_id`, backfills it, then enforces NOT NULL and new uniqueness. Idempotent.

---

## Model recap (after this slice)

```
production
 ├── roles        (characters; shared across casts)
 ├── casts        (Gold, Blue, … ; ≥1, one is_default)
 ├── performers   (people; own measurements)
 └── castings     (cast_id + role_id + performer_id + assignment)  -- now per cast
```
Per **(cast, role)**: at most one `primary`, any number of `understudy`. Roles are shared across casts; each cast assigns its own people.

---

## File structure

```
supabase/migrations/0004_casts.sql                # casts table, cast_id, backfill, constraints
src/lib/data/
├── casts.ts / casts.test.ts                       # NEW: list/create/delete casts
└── castings.ts / castings.test.ts                 # MODIFY: cast_id in Casting + addCastMember
src/app/api/productions/[id]/
├── casts/route.ts (+ test)                         # NEW: GET list / POST create
├── casts/[castId]/route.ts                         # NEW: DELETE
└── castings/route.ts (+ test)                       # MODIFY: require castId + validate role/cast in production
src/app/productions/[id]/page.tsx                   # MODIFY: fetch casts; render <CastWorkspace>
src/app/productions/[id]/performers/[performerId]/page.tsx  # MODIFY: header shows the cast too
src/components/
├── CastWorkspace.tsx                               # NEW: cast switcher + per-cast role board
└── CastBoard.tsx                                   # DELETE (folded into CastWorkspace)
```

---

## Task 1: Migration — casts + castings.cast_id

**Files:** Create `supabase/migrations/0004_casts.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_casts.sql`:
```sql
-- Named, colored casts within a production (e.g. Gold / Blue).
create table if not exists casts (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name          text not null,
  color         text not null default 'slate',
  is_default    boolean not null default false,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists casts_production_id_idx on casts(production_id);

-- One default cast per production that doesn't have any cast yet (idempotent).
insert into casts (production_id, name, color, is_default, display_order)
select p.id, 'Main Cast', 'slate', true, 0
from productions p
where not exists (select 1 from casts c where c.production_id = p.id);

-- Add cast_id to castings, backfill to each production's default cast, then enforce.
alter table castings add column if not exists cast_id uuid references casts(id) on delete cascade;

update castings cs
set cast_id = c.id
from casts c
where c.production_id = cs.production_id and c.is_default = true and cs.cast_id is null;

alter table castings alter column cast_id set not null;

-- Uniqueness now keys on the cast as well.
alter table castings drop constraint if exists castings_role_id_performer_id_key;
alter table castings add constraint castings_cast_role_performer_key
  unique (cast_id, role_id, performer_id);

-- At most one primary per (cast, role).
create unique index if not exists castings_one_primary_per_cast_role
  on castings (cast_id, role_id) where assignment = 'primary';

create index if not exists castings_cast_id_idx on castings(cast_id);
```

- [ ] **Step 2: Apply it in Supabase**

Run the file's contents in the Supabase SQL Editor (after 0003).
Expected: `casts` table exists with one "Main Cast" row per production; `castings.cast_id` is populated + NOT NULL; the new unique constraint + primary index exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_casts.sql
git commit -m "feat: add casts table and castings.cast_id"
```

---

## Task 2: casts data layer (TDD)

**Files:** Create `src/lib/data/casts.ts`, `src/lib/data/casts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/casts.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const listEq = vi.fn(() => ({ order: order1 }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEqProd = vi.fn();
const deleteEqId = vi.fn(() => ({ eq: deleteEqProd }));
const del = vi.fn(() => ({ eq: deleteEqId }));
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listCasts, createCast, deleteCast } from "@/lib/data/casts";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEqProd, deleteEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  order1.mockReturnValue({ order: order2 });
  listEq.mockReturnValue({ order: order1 });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  deleteEqId.mockReturnValue({ eq: deleteEqProd });
  del.mockReturnValue({ eq: deleteEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listCasts filters by production, ordered by display_order then created_at", async () => {
  order2.mockResolvedValue({ data: [{ id: "ct1", name: "Gold" }], error: null });
  const rows = await listCasts("p1");
  expect(from).toHaveBeenCalledWith("casts");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "ct1", name: "Gold" }]);
});

test("createCast inserts a trimmed name with default color", async () => {
  insertSingle.mockResolvedValue({ data: { id: "ct2", name: "Blue", color: "blue" }, error: null });
  const row = await createCast({ productionId: "p1", name: "  Blue  ", color: "blue" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Blue", color: "blue" });
  expect(row).toEqual({ id: "ct2", name: "Blue", color: "blue" });
});

test("createCast falls back to 'slate' when no color given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "ct3", name: "Cast C", color: "slate" }, error: null });
  await createCast({ productionId: "p1", name: "Cast C" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Cast C", color: "slate" });
});

test("createCast rejects an empty name", async () => {
  await expect(createCast({ productionId: "p1", name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("deleteCast deletes by id scoped to the production", async () => {
  deleteEqProd.mockResolvedValue({ error: null });
  await deleteCast("p1", "ct1");
  expect(deleteEqId).toHaveBeenCalledWith("id", "ct1");
  expect(deleteEqProd).toHaveBeenCalledWith("production_id", "p1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/casts.test.ts`
Expected: FAIL "Cannot find module '@/lib/data/casts'".

- [ ] **Step 3: Implement**

Create `src/lib/data/casts.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface Cast {
  id: string;
  production_id: string;
  name: string;
  color: string;
  is_default: boolean;
  display_order: number;
  created_at: string;
}

export async function listCasts(productionId: string): Promise<Cast[]> {
  const { data, error } = await supabaseAdmin
    .from("casts")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Cast[];
}

export async function createCast(input: {
  productionId: string;
  name: string;
  color?: string;
}): Promise<Cast> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Cast name is required");
  const { data, error } = await supabaseAdmin
    .from("casts")
    .insert({ production_id: input.productionId, name, color: input.color ?? "slate" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Cast;
}

export async function deleteCast(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("casts")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/casts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/casts.ts src/lib/data/casts.test.ts
git commit -m "feat: add casts data layer"
```

---

## Task 3: castings data layer — add cast_id (TDD)

**Files:** Modify `src/lib/data/castings.ts`, `src/lib/data/castings.test.ts`

- [ ] **Step 1: Update the test**

In `src/lib/data/castings.test.ts`, replace the `addCastMember` happy-path test with this version (adds `castId`), and leave the other two tests as-is:
```ts
test("addCastMember creates a performer then a casting and returns both", async () => {
  createPerformer.mockResolvedValue({ id: "pf9", label: "Ava" });
  insertSingle.mockResolvedValue({
    data: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    castId: "ct1",
    roleId: "r1",
    name: "Ava",
    assignment: "understudy",
  });
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Ava" });
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    cast_id: "ct1",
    role_id: "r1",
    performer_id: "pf9",
    assignment: "understudy",
  });
  expect(result).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
  });
});
```
Also update the invalid-assignment test's call to include `castId: "ct1"`:
```ts
test("addCastMember rejects an invalid assignment", async () => {
  await expect(
    // @ts-expect-error testing runtime guard with a bad value
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", name: "Ava", assignment: "lead" }),
  ).rejects.toThrow("assignment");
  expect(createPerformer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/castings.test.ts`
Expected: FAIL (insert called without `cast_id`; type error on the extra `castId` arg until implementation updates).

- [ ] **Step 3: Update the implementation**

In `src/lib/data/castings.ts`: add `cast_id` to the `Casting` interface and `castId` to `addCastMember`:
```ts
export interface Casting {
  id: string;
  production_id: string;
  cast_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
  created_at: string;
}

export async function addCastMember(input: {
  productionId: string;
  castId: string;
  roleId: string;
  name: string;
  assignment: Assignment;
}): Promise<{ performer: Performer; casting: Casting }> {
  if (input.assignment !== "primary" && input.assignment !== "understudy") {
    throw new ValidationError("Invalid assignment");
  }
  const performer = await createPerformer({ productionId: input.productionId, label: input.name });
  const { data, error } = await supabaseAdmin
    .from("castings")
    .insert({
      production_id: input.productionId,
      cast_id: input.castId,
      role_id: input.roleId,
      performer_id: performer.id,
      assignment: input.assignment,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { performer, casting: data as Casting };
}
```
(`listCastings` is unchanged — `select("*")` already returns the new `cast_id` column.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/castings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/castings.ts src/lib/data/castings.test.ts
git commit -m "feat: add cast_id to castings and addCastMember"
```

---

## Task 4: casts API — GET list / POST create / DELETE (TDD)

**Files:** Create `src/app/api/productions/[id]/casts/route.ts`, `src/app/api/productions/[id]/casts/[castId]/route.ts`, `src/app/api/productions/[id]/casts/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/casts/route.test.ts`:
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

const listCasts = vi.fn();
const createCast = vi.fn();
vi.mock("@/lib/data/casts", () => ({
  listCasts: (...a: unknown[]) => listCasts(...a),
  createCast: (...a: unknown[]) => createCast(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/casts/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listCasts, createCast].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});

test("GET lists casts", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listCasts.mockResolvedValue([{ id: "ct1", name: "Gold" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ casts: [{ id: "ct1", name: "Gold" }] });
  expect(listCasts).toHaveBeenCalledWith("p1");
});

test("POST creates a cast (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createCast.mockResolvedValue({ id: "ct2", name: "Blue", color: "blue" });
  const res = await POST(postReq({ name: "Blue", color: "blue" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createCast).toHaveBeenCalledWith({ productionId: "p1", name: "Blue", color: "blue" });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createCast.mockRejectedValue(new ValidationError("Cast name is required"));
  const res = await POST(postReq({ name: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/casts/route.test.ts"`
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement the list/create route**

Create `src/app/api/productions/[id]/casts/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCasts, createCast } from "@/lib/data/casts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const casts = await listCasts(id);
    return NextResponse.json({ casts });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string; color?: string };
    const cast = await createCast({
      productionId: id,
      name: typeof body.name === "string" ? body.name : "",
      color: typeof body.color === "string" ? body.color : undefined,
    });
    return NextResponse.json({ cast }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Implement the delete route**

Create `src/app/api/productions/[id]/casts/[castId]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCasts, deleteCast } from "@/lib/data/casts";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string; castId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, castId } = await params;
    await assertProductionInOrg(orgId, id);
    const casts = await listCasts(id);
    if (casts.length <= 1) {
      throw new ValidationError("A production must have at least one cast");
    }
    await deleteCast(id, castId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/casts/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0), then:
```bash
git add "src/app/api/productions/[id]/casts"
git commit -m "feat: add casts API routes (list/create/delete)"
```

---

## Task 5: castings API — require castId + validate role/cast ownership (TDD)

Closes the deferred gap: the casting write path now confirms the role and cast belong to the production.

**Files:** Modify `src/app/api/productions/[id]/castings/route.ts`, `src/app/api/productions/[id]/castings/route.test.ts`

- [ ] **Step 1: Replace the test**

Replace `src/app/api/productions/[id]/castings/route.test.ts` with:
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

const listRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({ listRoles: (...a: unknown[]) => listRoles(...a) }));

const listCasts = vi.fn();
vi.mock("@/lib/data/casts", () => ({ listCasts: (...a: unknown[]) => listCasts(...a) }));

const addCastMember = vi.fn();
vi.mock("@/lib/data/castings", () => ({ addCastMember: (...a: unknown[]) => addCastMember(...a) }));

import { POST } from "@/app/api/productions/[id]/castings/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listRoles, listCasts, addCastMember].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Bert" }]);
  listCasts.mockResolvedValue([{ id: "ct1", name: "Gold" }]);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST adds a cast member (201)", async () => {
  addCastMember.mockResolvedValue({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    castId: "ct1",
    roleId: "r1",
    name: "Ava",
    assignment: "primary",
  });
});

test("POST 404 when the role is not in the production", async () => {
  const res = await POST(postReq({ castId: "ct1", roleId: "rX", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addCastMember).not.toHaveBeenCalled();
});

test("POST 404 when the cast is not in the production", async () => {
  const res = await POST(postReq({ castId: "ctX", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addCastMember).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  addCastMember.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/castings/route.test.ts"`
Expected: FAIL (route doesn't validate role/cast yet; 404 tests fail).

- [ ] **Step 3: Update the route**

Replace `src/app/api/productions/[id]/castings/route.ts` with:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { addCastMember, type Assignment } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      castId?: string;
      roleId?: string;
      name?: string;
      assignment?: Assignment;
    };
    const castId = String(body.castId ?? "");
    const roleId = String(body.roleId ?? "");

    const [roles, casts] = await Promise.all([listRoles(id), listCasts(id)]);
    if (!roles.some((r) => r.id === roleId)) throw new NotFoundError("Role not found");
    if (!casts.some((c) => c.id === castId)) throw new NotFoundError("Cast not found");

    const result = await addCastMember({
      productionId: id,
      castId,
      roleId,
      name: typeof body.name === "string" ? body.name : "",
      assignment: body.assignment === "understudy" ? "understudy" : "primary",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/castings/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0), then:
```bash
git add "src/app/api/productions/[id]/castings"
git commit -m "feat: require castId and validate role/cast ownership on castings"
```

---

## Task 6: CastWorkspace — cast switcher + per-cast board

**Files:** Modify `src/app/productions/[id]/page.tsx`; Create `src/components/CastWorkspace.tsx`; Delete `src/components/CastBoard.tsx`

- [ ] **Step 1: Update the detail page**

Replace `src/app/productions/[id]/page.tsx` with:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { CastWorkspace } from "@/components/CastWorkspace";

export default async function ProductionDetailPage({
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

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="text-sm text-gray-500 hover:underline">
        ← Productions
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{production.title}</h1>
        <div className="flex items-center gap-2">
          {production.show_date && (
            <span className="text-sm text-gray-600">{formatShowDate(production.show_date)}</span>
          )}
          <CountdownBadge showDate={production.show_date} />
        </div>
      </div>

      <CastWorkspace
        productionId={id}
        initialCasts={casts.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        initialRoles={roles.map((r) => ({ id: r.id, name: r.name }))}
        initialPerformers={performers.map((p) => ({ id: p.id, name: p.label }))}
        initialCastings={castings.map((c) => ({
          id: c.id,
          castId: c.cast_id,
          roleId: c.role_id,
          performerId: c.performer_id,
          assignment: c.assignment,
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 2: Create the CastWorkspace component**

Create `src/components/CastWorkspace.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

interface Cast { id: string; name: string; color: string }
interface Role { id: string; name: string }
interface Performer { id: string; name: string }
interface Casting {
  id: string;
  castId: string;
  roleId: string;
  performerId: string;
  assignment: "primary" | "understudy";
}

const COLOR_DOT: Record<string, string> = {
  slate: "bg-slate-400",
  gold: "bg-amber-400",
  blue: "bg-blue-500",
  red: "bg-red-500",
  green: "bg-emerald-500",
};

export function CastWorkspace({
  productionId,
  initialCasts,
  initialRoles,
  initialPerformers,
  initialCastings,
}: {
  productionId: string;
  initialCasts: Cast[];
  initialRoles: Role[];
  initialPerformers: Performer[];
  initialCastings: Casting[];
}) {
  const [casts, setCasts] = useState<Cast[]>(initialCasts);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [castings, setCastings] = useState<Casting[]>(initialCastings);
  const [selectedCastId, setSelectedCastId] = useState<string>(initialCasts[0]?.id ?? "");
  const [newRole, setNewRole] = useState("");
  const [newCast, setNewCast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";

  async function addCast(e: React.FormEvent) {
    e.preventDefault();
    if (!newCast.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/casts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newCast }),
    });
    if (res.ok) {
      const { cast } = (await res.json()) as { cast: Cast };
      setCasts((prev) => [...prev, cast]);
      setSelectedCastId(cast.id);
      setNewCast("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast");
    }
    setBusy(false);
  }

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRole.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newRole }),
    });
    if (res.ok) {
      const { role } = (await res.json()) as { role: Role };
      setRoles((prev) => [...prev, role]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }

  async function addCastMember(roleId: string, name: string, assignment: "primary" | "understudy") {
    if (!name.trim() || !selectedCastId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ castId: selectedCastId, roleId, name, assignment }),
    });
    if (res.ok) {
      const { performer, casting } = (await res.json()) as {
        performer: { id: string; label: string };
        casting: Casting;
      };
      setPerformers((prev) => [...prev, { id: performer.id, name: performer.label }]);
      setCastings((prev) => [...prev, casting]);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCastMember(performerId: string) {
    setBusy(true);
    const res = await fetch(`/api/performers/${performerId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setCastings((prev) => prev.filter((c) => c.performerId !== performerId));
    } else {
      setError("Couldn't remove cast member");
    }
    setBusy(false);
  }

  const inSelectedCast = castings.filter((c) => c.castId === selectedCastId);

  return (
    <div className="space-y-5">
      {/* Cast switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {casts.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCastId(c.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              c.id === selectedCastId ? "border-black font-semibold" : "border-gray-200 text-gray-600"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[c.color] ?? "bg-slate-400"}`} />
            {c.name}
          </button>
        ))}
        <form onSubmit={addCast} className="flex items-center gap-1">
          <input
            className="w-28 rounded-lg border p-1.5 text-sm"
            value={newCast}
            onChange={(e) => setNewCast(e.target.value)}
            placeholder="+ Cast"
          />
          <button type="submit" disabled={busy} className="rounded-lg border px-2 py-1 text-sm disabled:opacity-50">
            Add
          </button>
        </form>
      </div>

      {/* Roles for the selected cast */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Roles &amp; cast</h2>
        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
            No roles yet. Add the first character below.
          </p>
        ) : (
          <ul className="space-y-3">
            {roles.map((r) => {
              const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
              const primary = forRole.find((c) => c.assignment === "primary");
              const understudies = forRole.filter((c) => c.assignment === "understudy");
              return (
                <li key={r.id} className="rounded-lg border p-4">
                  <div className="mb-2 text-lg font-semibold">{r.name}</div>

                  <div className="mt-1">
                    <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">Primary</span>
                    {primary ? (
                      <CastLink
                        productionId={productionId}
                        performerId={primary.performerId}
                        name={nameOf(primary.performerId)}
                        onRemove={() => removeCastMember(primary.performerId)}
                        busy={busy}
                      />
                    ) : (
                      <AddName placeholder="Add primary" onAdd={(n) => addCastMember(r.id, n, "primary")} busy={busy} />
                    )}
                  </div>

                  <div className="mt-2">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Understudies</span>
                    {understudies.map((u) => (
                      <CastLink
                        key={u.performerId}
                        productionId={productionId}
                        performerId={u.performerId}
                        name={nameOf(u.performerId)}
                        onRemove={() => removeCastMember(u.performerId)}
                        busy={busy}
                      />
                    ))}
                    <AddName placeholder="Add understudy" onAdd={(n) => addCastMember(r.id, n, "understudy")} busy={busy} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50">
          Add role
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function CastLink({
  productionId,
  performerId,
  name,
  onRemove,
  busy,
}: {
  productionId: string;
  performerId: string;
  name: string;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <Link href={`/productions/${productionId}/performers/${performerId}`} className="font-medium hover:underline">
        {name}
      </Link>
      <button onClick={onRemove} disabled={busy} className="text-sm text-red-600 hover:underline disabled:opacity-50">
        Remove
      </button>
    </div>
  );
}

function AddName({
  placeholder,
  onAdd,
  busy,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
        setName("");
      }}
      className="mt-1 flex gap-2"
    >
      <input
        className="flex-1 rounded-lg border p-2 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
      />
      <button type="submit" disabled={busy} className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Delete the old CastBoard**

Run: `git rm src/components/CastBoard.tsx`
Confirm no references: `grep -rn "CastBoard" src` → none.

- [ ] **Step 4: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (all green).

- [ ] **Step 5: Commit**

```bash
git add "src/app/productions/[id]/page.tsx" src/components/CastWorkspace.tsx
git commit -m "feat: add cast switcher and per-cast assignments (CastWorkspace)"
```

---

## Task 7: Measurement page header — include the cast

**Files:** Modify `src/app/productions/[id]/performers/[performerId]/page.tsx`

- [ ] **Step 1: Add cast lookup + display**

In `src/app/productions/[id]/performers/[performerId]/page.tsx`, add `listCasts` to the imports and the parallel fetch, resolve the cast from the casting, and show it. Replace the file with:
```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements, listPerformers } from "@/lib/data/performers";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { MeasurementForm } from "@/components/MeasurementForm";

export default async function MeasurementPage({
  params,
}: {
  params: Promise<{ id: string; performerId: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await params;
  const production = await assertProductionInOrg(orgId, id);
  await assertPerformerInOrg(orgId, performerId);

  const [definitions, measurements, performers, roles, casts, castings] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurements(performerId),
    listPerformers(id),
    listRoles(id),
    listCasts(id),
    listCastings(id),
  ]);

  const performer = performers.find((p) => p.id === performerId);
  const casting = castings.find((c) => c.performer_id === performerId);
  const role = casting ? roles.find((r) => r.id === casting.role_id) : undefined;
  const cast = casting ? casts.find((c) => c.id === casting.cast_id) : undefined;

  const initial: Record<string, number> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_numeric;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href={`/productions/${id}`} className="text-sm text-gray-500 hover:underline">
        ← Cast
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-sm text-gray-500">
          {production.title}
          {cast ? ` · ${cast.name}` : ""}
        </p>
        <h1 className="text-2xl font-bold">{role?.name ?? "Measurements"}</h1>
        <p className="text-gray-600">
          {performer?.label ?? "Performer"}
          {casting?.assignment === "understudy" ? " · Understudy" : ""}
        </p>
      </div>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
    </main>
  );
}
```

- [ ] **Step 2: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (green).

- [ ] **Step 3: Commit**

```bash
git add "src/app/productions/[id]/performers/[performerId]/page.tsx"
git commit -m "feat: show the cast name on the measurement page header"
```

- [ ] **Step 4: Manual verify (browser)**

Open a production. Expected: a cast switcher (Main Cast + a color dot) at top; "+ Cast" adds Gold/Blue and switches to it; roles list shows per-cast Primary/Understudy slots (empty in a new cast). Assign a primary in Gold, switch to Blue → that slot is empty there; assign a different name. Tap a name → measurement page shows "Production · Cast" and role/name. Switch back to Gold → its assignment persists.

---

## Milestone 2 · Slice 3 complete

Productions support multiple named, colored casts; roles are shared while primary/understudy assignments are per cast; the measurement page shows which production and cast a person is in.

---

## Deferred / follow-ups (carried forward)

**From this slice's final review (robustness/UX — no security issues):**
- **Map Postgres `23505` → `ValidationError` (400)** in `addCastMember` so duplicate-primary / duplicate-casting return a friendly message instead of a 500 with the raw DB string. Branch on the index name in `error.message` for a specific message (one-primary vs duplicate-person).
- **Make `addCastMember` transactional** (or delete the just-created performer on casting-insert failure) so a rejected casting doesn't orphan a performer — compounds once performer-reuse lands.
- **`errorResponse` 500 branch leaks raw error messages** to the client — return a generic message for untyped errors (app-wide hardening).
- **Cast color picker:** `addCast` only sends `{ name }`, so every cast is `slate`; the color column/dots exist but aren't user-selectable yet.
- **Guarantee one default cast per production** (`unique (production_id) where is_default`) + harden the 0004 backfill against a production lacking a default.
- **Measurement page assumes one casting per performer** (`find(...)`); safe now (one performer = one casting) but add a comment / resolve by route once performer-reuse exists.
- **Rename/recolor a cast**, reorder casts, mark a different default — add when needed.
- **Garment templates + deterministic fabric calc engine** (spec §5 — the "how much fabric" core) — the big next milestone; needs Nada's measurement list + skirt/pants/vest formulas.
- **Per-role costume designs**, then sourcing (make/on-hand/shared) + budgets, then play-templates/invites.
- Carry-overs: CastWorkspace confirm dialogs for destructive deletes; reuse-existing-performer across roles/casts; in/cm toggle; measurement-clear path; org name from Clerk; `updated_at` trigger; per-production access roles; `assertWithinPlanLimits`.

---

## Self-review notes

- **Spec coverage:** §4 `casts` + `castings.cast_id` (Task 1–3); §7 cast switcher + per-cast assignments (Task 6). Role/cast ownership validation on writes (Task 5) closes the prior slice's deferred gap.
- **Placeholders:** none — every code/test step is complete.
- **Type consistency:** `Cast`, `Casting` (now with `cast_id`), `listCasts`/`createCast`/`deleteCast`, `addCastMember` (now with `castId`), and the `{ casts } / { cast } / { performer, casting }` API shapes are consistent across data layer, routes, page, and component. The client component's local `Casting`/`Cast`/`Role`/`Performer` shapes mirror the server data mapped in the page. Dynamic params typed `Promise<…>` and awaited. `deleteCast`/`deleteRole` are production-scoped. Removal reuses the org-guarded `DELETE /api/performers/[performerId]`.
- **Migration safety:** default-cast insert and cast_id backfill are idempotent; NOT NULL is set only after backfill; old unique dropped, new `(cast_id, role_id, performer_id)` + partial one-primary-per-(cast,role) added.
