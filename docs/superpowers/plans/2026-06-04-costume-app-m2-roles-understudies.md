# Costume App — Milestone 2 · Slice 2: Roles & Understudies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat per-production performer list into **roles** (characters), each with a **primary** cast member (a named person) and any number of **understudies**, reusing the existing per-performer measurement flow.

**Architecture:** Builds on M2 Slice 1. New `roles` and `castings` tables; `performers` keeps being the *people* (with names) that own measurements. A casting links a performer to a role with `assignment = 'primary' | 'understudy'`. There is exactly one implicit cast in this slice — the `casts` table and a `cast_id` on castings are deliberately deferred to the next slice (Gold/Blue). All role/casting mutations are nested under `/api/productions/[id]/...` so org tenancy is enforced via the existing `assertProductionInOrg`. Pure logic + data layer are unit-tested; pages/components verified by running the app.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Tailwind 4, Clerk, Supabase (`@supabase/supabase-js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-costume-app-design.md` — §4 (`roles`, `castings`), §7 (Cast). This slice implements roles + primary/understudy assignment; **casts (Gold/Blue) are the next slice** (will add a `casts` table + `castings.cast_id`).

> **Data migration:** the 17 Mary Poppins characters were seeded into `performers` in Slice 1 (a simplification). Task 8 converts them into `roles` and removes those performer rows (they are characters, not people). This touches live data — run it knowingly.

---

## Model recap (after this slice)

```
production
 ├── roles            (characters: "Mary Poppins", "Bert", …)
 ├── performers       (people, with a name; own measurements)
 └── castings         (role_id + performer_id + assignment 'primary'|'understudy')
```
A role's **primary** = its casting with `assignment='primary'` (at most one). A role's **understudies** = its castings with `assignment='understudy'` (zero or more). Removing a cast member deletes the *performer*, which cascades the casting + measurements.

---

## File structure

```
supabase/migrations/0003_roles_castings.sql     # roles, castings tables
src/lib/data/
├── roles.ts / roles.test.ts                     # NEW: list/create/delete roles
├── castings.ts / castings.test.ts               # NEW: list castings, addCastMember
└── performers.ts                                # (unchanged; createPerformer/deletePerformer reused)
src/app/api/productions/[id]/
├── roles/route.ts (+ test)                       # NEW: GET list / POST create role
├── roles/[roleId]/route.ts                       # NEW: DELETE role
└── castings/route.ts (+ test)                    # NEW: POST add cast member
src/app/productions/[id]/page.tsx                 # MODIFY: fetch roles+castings+performers, render <CastBoard>
src/components/
├── CastBoard.tsx                                 # NEW: client — roles + per-role primary/understudy
└── PerformerList.tsx                             # DELETE (replaced by CastBoard)
scripts/migrate-seeded-performers-to-roles.mjs    # one-off data migration (Task 8)
```

---

## Task 1: Schema migration — roles + castings

**Files:** Create `supabase/migrations/0003_roles_castings.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_roles_castings.sql`:
```sql
-- Characters in a production (e.g. "Mary Poppins", "Bert").
create table if not exists roles (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name          text not null,
  display_order int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists roles_production_id_idx on roles(production_id);

-- Assignment of a person (performer) to a role, as primary or understudy.
-- cast_id (Gold/Blue) is intentionally deferred to the next slice.
create table if not exists castings (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  performer_id  uuid not null references performers(id) on delete cascade,
  assignment    text not null check (assignment in ('primary', 'understudy')),
  created_at    timestamptz not null default now(),
  unique (role_id, performer_id)
);
create index if not exists castings_production_id_idx on castings(production_id);
create index if not exists castings_role_id_idx on castings(role_id);
```

- [ ] **Step 2: Apply it in Supabase**

In the Supabase SQL Editor, run the file's contents.
Expected: `roles` and `castings` tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_roles_castings.sql
git commit -m "feat: add roles and castings schema"
```

---

## Task 2: roles data layer (TDD)

**Files:** Create `src/lib/data/roles.ts`, `src/lib/data/roles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/roles.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const listEq = vi.fn(() => ({ order: order1 }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listRoles, createRole, deleteRole } from "@/lib/data/roles";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEq, del, select, from].forEach((m) =>
    m.mockReset(),
  );
  order1.mockReturnValue({ order: order2 });
  listEq.mockReturnValue({ order: order1 });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  del.mockReturnValue({ eq: deleteEq });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listRoles filters by production, ordered by display_order then created_at", async () => {
  order2.mockResolvedValue({ data: [{ id: "r1", name: "Bert" }], error: null });
  const rows = await listRoles("p1");
  expect(from).toHaveBeenCalledWith("roles");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "r1", name: "Bert" }]);
});

test("createRole inserts a trimmed name", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r2", name: "Mary Poppins" }, error: null });
  const row = await createRole({ productionId: "p1", name: "  Mary Poppins  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Mary Poppins" });
  expect(row).toEqual({ id: "r2", name: "Mary Poppins" });
});

test("createRole rejects an empty name", async () => {
  await expect(createRole({ productionId: "p1", name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("deleteRole deletes by id", async () => {
  deleteEq.mockResolvedValue({ error: null });
  await deleteRole("r1");
  expect(del).toHaveBeenCalled();
  expect(deleteEq).toHaveBeenCalledWith("id", "r1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/roles.test.ts`
Expected: FAIL with "Cannot find module '@/lib/data/roles'".

- [ ] **Step 3: Implement**

Create `src/lib/data/roles.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface Role {
  id: string;
  production_id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export async function listRoles(productionId: string): Promise<Role[]> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}

export async function createRole(input: { productionId: string; name: string }): Promise<Role> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Role name is required");
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ production_id: input.productionId, name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("roles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/roles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/roles.ts src/lib/data/roles.test.ts
git commit -m "feat: add roles data layer"
```

---

## Task 3: castings data layer (TDD)

`listCastings` returns raw castings (the page joins to roles/performers in memory). `addCastMember` creates the person then the casting, in one call, reusing `createPerformer`.

**Files:** Create `src/lib/data/castings.ts`, `src/lib/data/castings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/castings.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

const createPerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  createPerformer: (...a: unknown[]) => createPerformer(...a),
}));

import { listCastings, addCastMember } from "@/lib/data/castings";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, select, from, createPerformer].forEach((m) =>
    m.mockReset(),
  );
  listEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert });
});

test("listCastings filters by production, ordered by created_at", async () => {
  order.mockResolvedValue({
    data: [{ id: "c1", role_id: "r1", performer_id: "pf1", assignment: "primary" }],
    error: null,
  });
  const rows = await listCastings("p1");
  expect(from).toHaveBeenCalledWith("castings");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "c1", role_id: "r1", performer_id: "pf1", assignment: "primary" }]);
});

test("addCastMember creates a performer then a casting and returns both", async () => {
  createPerformer.mockResolvedValue({ id: "pf9", label: "Ava" });
  insertSingle.mockResolvedValue({
    data: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    roleId: "r1",
    name: "Ava",
    assignment: "understudy",
  });
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Ava" });
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    role_id: "r1",
    performer_id: "pf9",
    assignment: "understudy",
  });
  expect(result).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
  });
});

test("addCastMember rejects an invalid assignment", async () => {
  await expect(
    // @ts-expect-error testing runtime guard with a bad value
    addCastMember({ productionId: "p1", roleId: "r1", name: "Ava", assignment: "lead" }),
  ).rejects.toThrow("assignment");
  expect(createPerformer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/castings.test.ts`
Expected: FAIL with "Cannot find module '@/lib/data/castings'".

- [ ] **Step 3: Implement**

Create `src/lib/data/castings.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import { createPerformer, type Performer } from "@/lib/data/performers";

export type Assignment = "primary" | "understudy";

export interface Casting {
  id: string;
  production_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
  created_at: string;
}

export async function listCastings(productionId: string): Promise<Casting[]> {
  const { data, error } = await supabaseAdmin
    .from("castings")
    .select("*")
    .eq("production_id", productionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Casting[];
}

export async function addCastMember(input: {
  productionId: string;
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/castings.test.ts`
Expected: PASS (3 tests). (`createPerformer` already trims/validates the name and throws `ValidationError` on empty.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/castings.ts src/lib/data/castings.test.ts
git commit -m "feat: add castings data layer with addCastMember"
```

---

## Task 4: Roles API — GET list / POST create / DELETE (TDD)

**Files:** Create `src/app/api/productions/[id]/roles/route.ts`, `src/app/api/productions/[id]/roles/[roleId]/route.ts`, `src/app/api/productions/[id]/roles/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/roles/route.test.ts`:
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
const createRole = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  createRole: (...a: unknown[]) => createRole(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/roles/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listRoles, createRole].forEach((m) => m.mockReset());
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

test("GET lists roles", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Bert" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ roles: [{ id: "r1", name: "Bert" }] });
  expect(listRoles).toHaveBeenCalledWith("p1");
});

test("POST creates a role (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createRole.mockResolvedValue({ id: "r2", name: "Mary Poppins" });
  const res = await POST(postReq({ name: "Mary Poppins" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createRole).toHaveBeenCalledWith({ productionId: "p1", name: "Mary Poppins" });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createRole.mockRejectedValue(new ValidationError("Role name is required"));
  const res = await POST(postReq({ name: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/roles/route.test.ts"`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the list/create route**

Create `src/app/api/productions/[id]/roles/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles, createRole } from "@/lib/data/roles";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const roles = await listRoles(id);
    return NextResponse.json({ roles });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string };
    const role = await createRole({ productionId: id, name: typeof body.name === "string" ? body.name : "" });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Implement the role delete route**

Create `src/app/api/productions/[id]/roles/[roleId]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteRole } from "@/lib/data/roles";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteRole(roleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/roles/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0), then:
```bash
git add "src/app/api/productions/[id]/roles"
git commit -m "feat: add roles API routes (list/create/delete)"
```

---

## Task 5: Castings API — POST add cast member (TDD)

**Files:** Create `src/app/api/productions/[id]/castings/route.ts`, `src/app/api/productions/[id]/castings/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/castings/route.test.ts`:
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

const addCastMember = vi.fn();
vi.mock("@/lib/data/castings", () => ({
  addCastMember: (...a: unknown[]) => addCastMember(...a),
}));

import { POST } from "@/app/api/productions/[id]/castings/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, addCastMember].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq({ roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
});

test("POST adds a cast member (201) and returns performer + casting", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  addCastMember.mockResolvedValue({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
  const res = await POST(postReq({ roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    roleId: "r1",
    name: "Ava",
    assignment: "primary",
  });
  expect(await res.json()).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  addCastMember.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ roleId: "r1", name: "", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/castings/route.test.ts"`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/app/api/productions/[id]/castings/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { addCastMember, type Assignment } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      roleId?: string;
      name?: string;
      assignment?: Assignment;
    };
    const result = await addCastMember({
      productionId: id,
      roleId: String(body.roleId ?? ""),
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
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0), then:
```bash
git add "src/app/api/productions/[id]/castings"
git commit -m "feat: add castings API route (add cast member)"
```

---

## Task 6: Production detail page → roles + cast board

Replace the flat performer list with roles. The server component joins roles + castings + performers into a per-role shape and hands it to a new `CastBoard`.

**Files:** Modify `src/app/productions/[id]/page.tsx`; Create `src/components/CastBoard.tsx`; Delete `src/components/PerformerList.tsx`

- [ ] **Step 1: Build the server detail page**

Replace `src/app/productions/[id]/page.tsx` with:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { CastBoard, type RoleWithCast } from "@/components/CastBoard";

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

  const [roles, castings, performers] = await Promise.all([
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);

  const nameById = new Map(performers.map((p) => [p.id, p.label]));
  const rolesWithCast: RoleWithCast[] = roles.map((role) => {
    const forRole = castings.filter((c) => c.role_id === role.id);
    const primaryCasting = forRole.find((c) => c.assignment === "primary");
    return {
      roleId: role.id,
      roleName: role.name,
      primary: primaryCasting
        ? { performerId: primaryCasting.performer_id, name: nameById.get(primaryCasting.performer_id) ?? "" }
        : null,
      understudies: forRole
        .filter((c) => c.assignment === "understudy")
        .map((c) => ({ performerId: c.performer_id, name: nameById.get(c.performer_id) ?? "" })),
    };
  });

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

      <section>
        <h2 className="mb-3 text-lg font-semibold">Roles &amp; cast</h2>
        <CastBoard productionId={id} initialRoles={rolesWithCast} />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Build the CastBoard client component**

Create `src/components/CastBoard.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export interface CastMember {
  performerId: string;
  name: string;
}

export interface RoleWithCast {
  roleId: string;
  roleName: string;
  primary: CastMember | null;
  understudies: CastMember[];
}

export function CastBoard({
  productionId,
  initialRoles,
}: {
  productionId: string;
  initialRoles: RoleWithCast[];
}) {
  const [roles, setRoles] = useState<RoleWithCast[]>(initialRoles);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { role } = (await res.json()) as { role: { id: string; name: string } };
      setRoles((prev) => [...prev, { roleId: role.id, roleName: role.name, primary: null, understudies: [] }]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }

  async function deleteRole(roleId: string) {
    setBusy(true);
    const res = await fetch(`/api/productions/${productionId}/roles/${roleId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setRoles((prev) => prev.filter((r) => r.roleId !== roleId));
    setBusy(false);
  }

  async function addCast(roleId: string, name: string, assignment: "primary" | "understudy") {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId, name, assignment }),
    });
    if (res.ok) {
      const { performer } = (await res.json()) as { performer: { id: string; label: string } };
      const member = { performerId: performer.id, name: performer.label };
      setRoles((prev) =>
        prev.map((r) =>
          r.roleId !== roleId
            ? r
            : assignment === "primary"
              ? { ...r, primary: member }
              : { ...r, understudies: [...r.understudies, member] },
        ),
      );
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCast(roleId: string, performerId: string) {
    setBusy(true);
    const res = await fetch(`/api/performers/${performerId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setRoles((prev) =>
        prev.map((r) =>
          r.roleId !== roleId
            ? r
            : {
                ...r,
                primary: r.primary?.performerId === performerId ? null : r.primary,
                understudies: r.understudies.filter((u) => u.performerId !== performerId),
              },
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
          No roles yet. Add the first character below.
        </p>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => (
            <li key={r.roleId} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-lg font-semibold">{r.roleName}</span>
                <button
                  onClick={() => deleteRole(r.roleId)}
                  disabled={busy}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete role
                </button>
              </div>

              <CastSlot
                label="Primary"
                productionId={productionId}
                member={r.primary}
                onAdd={(name) => addCast(r.roleId, name, "primary")}
                onRemove={(pid) => removeCast(r.roleId, pid)}
                busy={busy}
              />

              <div className="mt-2">
                <span className="text-xs uppercase tracking-wide text-gray-400">Understudies</span>
                {r.understudies.map((u) => (
                  <CastSlot
                    key={u.performerId}
                    productionId={productionId}
                    member={u}
                    onRemove={(pid) => removeCast(r.roleId, pid)}
                    busy={busy}
                  />
                ))}
                <AddName placeholder="Add understudy" onAdd={(name) => addCast(r.roleId, name, "understudy")} busy={busy} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add role
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function CastSlot({
  label,
  productionId,
  member,
  onAdd,
  onRemove,
  busy,
}: {
  label?: string;
  productionId: string;
  member: CastMember | null;
  onAdd?: (name: string) => void;
  onRemove: (performerId: string) => void;
  busy: boolean;
}) {
  if (!member) {
    return (
      <div className="mt-1">
        {label && <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">{label}</span>}
        {onAdd && <AddName placeholder={`Add ${label?.toLowerCase() ?? "name"}`} onAdd={onAdd} busy={busy} />}
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <span>
        {label && <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">{label}</span>}
        <Link
          href={`/productions/${productionId}/performers/${member.performerId}`}
          className="font-medium hover:underline"
        >
          {member.name}
        </Link>
      </span>
      <button
        onClick={() => onRemove(member.performerId)}
        disabled={busy}
        className="text-sm text-red-600 hover:underline disabled:opacity-50"
      >
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
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Delete the obsolete PerformerList**

Run:
```bash
git rm src/components/PerformerList.tsx
```
(Its only importer was the detail page, which no longer references it.)

- [ ] **Step 4: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (all green — these are UI changes; no tested module changed signature).

- [ ] **Step 5: Commit**

```bash
git add "src/app/productions/[id]/page.tsx" src/components/CastBoard.tsx
git commit -m "feat: replace flat performer list with roles + cast board"
```

---

## Task 7: Remove the now-unused flat performers API route

The flat "add performer" route (`POST/GET /api/productions/[id]/performers`) is no longer used — people are created via castings. Remove it to avoid dead, untenanted surface. (The performer **DELETE** + **measurements** routes stay — they're used by removal and the measurement page.)

**Files:** Delete `src/app/api/productions/[id]/performers/route.ts` and its test.

- [ ] **Step 1: Remove the route + test**

Run:
```bash
git rm "src/app/api/productions/[id]/performers/route.ts" "src/app/api/productions/[id]/performers/route.test.ts"
```

- [ ] **Step 2: Confirm nothing references it**

Run: `grep -rn "productions/.*/performers\"" src || true` and confirm no client code POSTs to that path (CastBoard uses `/castings` and `/roles`). `listPerformers`/`createPerformer` in the data layer remain (used by the detail page + castings).

- [ ] **Step 3: Type-check, test, commit**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (green), then:
```bash
git commit -m "chore: remove unused flat performers API route"
```

---

## Task 8: Migrate seeded characters (performers → roles)

The 17 Mary Poppins characters live in `performers` from Slice 1. Convert them to `roles` and remove those performer rows. **One-off data script** (not a schema migration).

**Files:** Create `scripts/migrate-seeded-performers-to-roles.mjs`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-seeded-performers-to-roles.mjs`:
```js
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// For each production, move performers that have NO casting (i.e. seeded characters,
// not real cast members) into roles, then delete those performer rows.
const { data: productions, error: pErr } = await supabase.from("productions").select("id, title");
if (pErr) throw pErr;

for (const prod of productions) {
  const { data: performers, error: perfErr } = await supabase
    .from("performers")
    .select("id, label, created_at")
    .eq("production_id", prod.id)
    .order("created_at", { ascending: true });
  if (perfErr) throw perfErr;

  const { data: castings, error: cErr } = await supabase
    .from("castings")
    .select("performer_id")
    .eq("production_id", prod.id);
  if (cErr) throw cErr;
  const castPerformerIds = new Set((castings ?? []).map((c) => c.performer_id));

  const toConvert = (performers ?? []).filter((p) => !castPerformerIds.has(p.id));
  if (toConvert.length === 0) {
    console.log(`${prod.title}: nothing to convert`);
    continue;
  }

  // Skip names already present as roles (idempotent).
  const { data: existingRoles } = await supabase.from("roles").select("name").eq("production_id", prod.id);
  const haveRole = new Set((existingRoles ?? []).map((r) => r.name));

  const roleRows = toConvert
    .filter((p) => !haveRole.has(p.label))
    .map((p, i) => ({ production_id: prod.id, name: p.label, display_order: (i + 1) * 10 }));

  if (roleRows.length > 0) {
    const { error: insErr } = await supabase.from("roles").insert(roleRows);
    if (insErr) throw insErr;
  }

  const ids = toConvert.map((p) => p.id);
  const { error: delErr } = await supabase.from("performers").delete().in("id", ids);
  if (delErr) throw delErr;

  console.log(`${prod.title}: converted ${roleRows.length} characters to roles, removed ${ids.length} seeded performers`);
}
```

- [ ] **Step 2: Run it (after the 0003 migration is applied in Supabase)**

Run: `node scripts/migrate-seeded-performers-to-roles.mjs`
Expected: `Mary Poppins: converted 17 characters to roles, removed 17 seeded performers`.

- [ ] **Step 3: Commit the script**

```bash
git add scripts/migrate-seeded-performers-to-roles.mjs
git commit -m "chore: add one-off script to migrate seeded characters to roles"
```

- [ ] **Step 4: Manual verify (browser, needs keys)**

Open the Mary Poppins production. Expected: the **Roles & cast** section lists the 17 characters, each with empty Primary/Understudy slots. Add a primary name → it appears and links to that performer's measurement page. Add an understudy → appears under Understudies. Tap a name → measurements page; enter + reload → persists. Remove a cast member → disappears.

---

## Milestone 2 · Slice 2 complete

Each role now has a named primary cast member and any number of understudies, every name is a real performer with their own measurements, and the seeded characters became roles. The model is ready for **multiple casts** (next slice: add `casts` + `castings.cast_id`, a cast switcher, and per-cast assignments).

---

## Deferred / follow-ups (carried forward)

- **Multiple casts (Gold/Blue)** — next slice: `casts` table, `castings.cast_id` (migration backfills existing castings to a default cast), cast switcher UI.
- **Reuse an existing performer across roles** — currently each assignment creates a new person; cross-role reuse is out of scope here.
- **Edit a role/performer name in place** — current UI is add/remove only.
- Plus carry-overs: in/cm toggle + server-derived measurement unit; measurement-clear path; org name from Clerk; `updated_at` trigger; per-production roles (owner/editor/viewer); `assertWithinPlanLimits`.

---

## Self-review notes

- **Spec coverage (this slice):** §4 `roles` (Task 1–2), `castings` with `assignment` (Task 1, 3); §7 Cast with primary + understudies per role (Task 6). `cast_id`/casts deferred to next slice by design (option A chosen with the user).
- **Placeholders:** none — every code/test step is complete.
- **Type consistency:** `Role`, `Casting`, `Assignment`, `CastMember`, `RoleWithCast`, `listRoles`/`createRole`/`deleteRole`, `listCastings`/`addCastMember`, and the `{ roles } / { role } / { performer, casting }` API shapes are consistent across data layer, routes, page, and component. Dynamic params typed `Promise<…>` and awaited. Removal reuses the existing `DELETE /api/performers/[performerId]` (already org-guarded via `assertPerformerInOrg`).
- **Tenancy:** role + casting mutations nested under `/api/productions/[id]/…` and gated by `assertProductionInOrg`; cast-member removal uses the org-guarded performer DELETE.
