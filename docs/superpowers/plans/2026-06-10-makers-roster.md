# Makers Roster (Phase 2a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An org-level roster of "makers" (people who sew costumes), each with a name + color, managed on a `/makers` page.

**Architecture:** New org-scoped `makers` table (migration 0013) + a CRUD data layer mirroring `casts`, CRUD API at `/api/makers`, and a `/makers` management page reusing the cast-color palette. This is phase 2a; assignment of makers to pieces is a separate follow-up plan.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase, Clerk, Vitest. `@/*` → `src/*`. **Requires migration 0013 applied to Supabase on deploy.**

**Conventions (verified):** data layer mirrors `src/lib/data/casts.ts` (org-scoped instead of production-scoped); routes do `getAuthContext()` → work → `errorResponse(err)`; `ensureOrganization(orgId, name)` guarantees the org row before inserting (makers FK → `organizations.clerk_org_id`); color tokens from `src/lib/cast-colors.ts` (`CAST_COLORS`, `DEFAULT_CAST_COLOR`, `castColorHex`). Spec: `docs/superpowers/specs/2026-06-10-maker-assignment-status-design.md`.

---

## File Structure

- **Create** `supabase/migrations/0013_makers.sql`
- **Create** `src/lib/data/makers.ts` (+ `.test.ts`)
- **Create** `src/app/api/makers/route.ts` (+ `.test.ts`) — GET list, POST create
- **Create** `src/app/api/makers/[makerId]/route.ts` (+ `.test.ts`) — PATCH, DELETE
- **Create** `src/app/makers/page.tsx` + `src/components/MakersManager.tsx`
- **Modify** `src/app/productions/page.tsx` — add a "Makers" link

---

## Task 1: Migration + makers data layer

**Files:**
- Create: `supabase/migrations/0013_makers.sql`
- Create: `src/lib/data/makers.ts`
- Create: `src/lib/data/makers.test.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_makers.sql`:

```sql
-- Org-level roster of people who make costumes (sewists). Assigned to costume
-- pieces in a later migration. Color reuses the cast color tokens.
create table if not exists makers (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  name       text not null,
  color      text not null default 'slate',
  created_at timestamptz not null default now()
);
create index if not exists makers_org_id_idx on makers(org_id);
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/data/makers.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const listOrder = vi.fn();
const listEq = vi.fn(() => ({ order: listOrder }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const updMaybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle: updMaybeSingle }));
const updEqOrg = vi.fn(() => ({ select: updSelect }));
const updEqId = vi.fn(() => ({ eq: updEqOrg }));
const update = vi.fn(() => ({ eq: updEqId }));
const delEqOrg = vi.fn();
const delEqId = vi.fn(() => ({ eq: delEqOrg }));
const del = vi.fn(() => ({ eq: delEqId }));
const select = vi.fn(() => ({ eq: listEq }));
const from = vi.fn(() => ({ select, insert, update, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listMakers, createMaker, updateMaker, deleteMaker } from "@/lib/data/makers";

beforeEach(() => {
  [listOrder, listEq, insertSingle, insertSelect, insert, updMaybeSingle, updSelect, updEqOrg, updEqId, update, delEqOrg, delEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  listEq.mockReturnValue({ order: listOrder });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  updSelect.mockReturnValue({ maybeSingle: updMaybeSingle });
  updEqOrg.mockReturnValue({ select: updSelect });
  updEqId.mockReturnValue({ eq: updEqOrg });
  update.mockReturnValue({ eq: updEqId });
  delEqId.mockReturnValue({ eq: delEqOrg });
  del.mockReturnValue({ eq: delEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, update, delete: del });
});

test("listMakers filters by org, oldest-first", async () => {
  listOrder.mockResolvedValue({ data: [{ id: "m1", org_id: "org_1", name: "Nada", color: "plum" }], error: null });
  const rows = await listMakers("org_1");
  expect(from).toHaveBeenCalledWith("makers");
  expect(listEq).toHaveBeenCalledWith("org_id", "org_1");
  expect(listOrder).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "m1", org_id: "org_1", name: "Nada", color: "plum" }]);
});

test("createMaker inserts a trimmed name with the given color", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m2", org_id: "org_1", name: "Crystal", color: "red" }, error: null });
  const row = await createMaker("org_1", { name: "  Crystal  ", color: "red" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Crystal", color: "red" });
  expect(row.id).toBe("m2");
});

test("createMaker defaults the color to slate", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m3" }, error: null });
  await createMaker("org_1", { name: "Pat" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Pat", color: "slate" });
});

test("createMaker rejects an empty name", async () => {
  await expect(createMaker("org_1", { name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateMaker patches name and color scoped by id and org", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "m1", name: "Nada", color: "blue" }, error: null });
  const row = await updateMaker("org_1", "m1", { name: " Nada ", color: "blue" });
  expect(update).toHaveBeenCalledWith({ name: "Nada", color: "blue" });
  expect(updEqId).toHaveBeenCalledWith("id", "m1");
  expect(updEqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "m1", name: "Nada", color: "blue" });
});

test("updateMaker rejects an empty name when name is provided", async () => {
  await expect(updateMaker("org_1", "m1", { name: "   " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateMaker throws NotFoundError when no row matches", async () => {
  updMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateMaker("org_1", "nope", { color: "gold" })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteMaker deletes by id scoped to the org", async () => {
  delEqOrg.mockResolvedValue({ error: null });
  await deleteMaker("org_1", "m1");
  expect(delEqId).toHaveBeenCalledWith("id", "m1");
  expect(delEqOrg).toHaveBeenCalledWith("org_id", "org_1");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/data/makers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the data layer**

Create `src/lib/data/makers.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Maker {
  id: string;
  org_id: string;
  name: string;
  color: string;
  created_at: string;
}

export async function listMakers(orgId: string): Promise<Maker[]> {
  const { data, error } = await supabaseAdmin
    .from("makers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Maker[];
}

export async function createMaker(orgId: string, input: { name: string; color?: string }): Promise<Maker> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Maker name is required");
  const { data, error } = await supabaseAdmin
    .from("makers")
    .insert({ org_id: orgId, name, color: input.color ?? "slate" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Maker;
}

export async function updateMaker(
  orgId: string,
  id: string,
  patch: { name?: string; color?: string },
): Promise<Maker> {
  const update: { name?: string; color?: string } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Maker name is required");
    update.name = trimmed;
  }
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await supabaseAdmin
    .from("makers")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Maker not found");
  return data as Maker;
}

export async function deleteMaker(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("makers")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/data/makers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_makers.sql src/lib/data/makers.ts src/lib/data/makers.test.ts
git commit -m "feat: makers table and org-scoped data layer"
```

---

## Task 2: Makers API routes

**Files:**
- Create: `src/app/api/makers/route.ts`
- Create: `src/app/api/makers/route.test.ts`
- Create: `src/app/api/makers/[makerId]/route.ts`
- Create: `src/app/api/makers/[makerId]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/makers/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: (...a: unknown[]) => ensureOrganization(...a) }));

const listMakers = vi.fn();
const createMaker = vi.fn();
vi.mock("@/lib/data/makers", () => ({
  listMakers: (...a: unknown[]) => listMakers(...a),
  createMaker: (...a: unknown[]) => createMaker(...a),
}));

import { GET, POST } from "@/app/api/makers/route";

beforeEach(() => {
  [getAuthContext, ensureOrganization, listMakers, createMaker].forEach((m) => m.mockReset());
});

function postReq(body: unknown) {
  return new Request("http://test/api/makers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET returns makers for the org", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listMakers.mockResolvedValue([{ id: "m1", name: "Nada", color: "plum" }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ makers: [{ id: "m1", name: "Nada", color: "plum" }] });
  expect(listMakers).toHaveBeenCalledWith("org_1");
});

test("POST creates a maker (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createMaker.mockResolvedValue({ id: "m2", name: "Crystal", color: "red" });
  const res = await POST(postReq({ name: "Crystal", color: "red" }));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ maker: { id: "m2", name: "Crystal", color: "red" } });
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", expect.any(String));
  expect(createMaker).toHaveBeenCalledWith("org_1", { name: "Crystal", color: "red" });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createMaker.mockRejectedValue(new ValidationError("Maker name is required"));
  const res = await POST(postReq({ name: "" }));
  expect(res.status).toBe(400);
});

test("POST 403 with no active org, never touches the DB", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(403, "No active organization"));
  const res = await POST(postReq({ name: "X" }));
  expect(res.status).toBe(403);
  expect(createMaker).not.toHaveBeenCalled();
});
```

Create `src/app/api/makers/[makerId]/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const updateMaker = vi.fn();
const deleteMaker = vi.fn();
vi.mock("@/lib/data/makers", () => ({
  updateMaker: (...a: unknown[]) => updateMaker(...a),
  deleteMaker: (...a: unknown[]) => deleteMaker(...a),
}));

import { PATCH, DELETE } from "@/app/api/makers/[makerId]/route";

beforeEach(() => {
  [getAuthContext, updateMaker, deleteMaker].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
});

const ctx = (makerId: string) => ({ params: Promise.resolve({ makerId }) });
function patchReq(body: unknown) {
  return new Request("http://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("PATCH updates a maker", async () => {
  updateMaker.mockResolvedValue({ id: "m1", name: "Nada", color: "blue" });
  const res = await PATCH(patchReq({ name: "Nada", color: "blue" }), ctx("m1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ maker: { id: "m1", name: "Nada", color: "blue" } });
  expect(updateMaker).toHaveBeenCalledWith("org_1", "m1", { name: "Nada", color: "blue" });
});

test("PATCH 404 when the maker is not in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  updateMaker.mockRejectedValue(new NotFoundError("Maker not found"));
  const res = await PATCH(patchReq({ color: "gold" }), ctx("nope"));
  expect(res.status).toBe(404);
});

test("DELETE removes a maker", async () => {
  deleteMaker.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("m1"));
  expect(res.status).toBe(200);
  expect(deleteMaker).toHaveBeenCalledWith("org_1", "m1");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/makers/route.test.ts "src/app/api/makers/[makerId]/route.test.ts"`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Write the routes**

Create `src/app/api/makers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { listMakers, createMaker } from "@/lib/data/makers";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const makers = await listMakers(orgId);
    return NextResponse.json({ makers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    const body = (await request.json()) as { name?: string; color?: string; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const maker = await createMaker(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      color: typeof body.color === "string" ? body.color : undefined,
    });
    return NextResponse.json({ maker }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/makers/[makerId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { updateMaker, deleteMaker } from "@/lib/data/makers";

type Ctx = { params: Promise<{ makerId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { makerId } = await params;
    const body = (await request.json()) as { name?: string; color?: string };
    const patch: { name?: string; color?: string } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.color === "string") patch.color = body.color;
    const maker = await updateMaker(orgId, makerId, patch);
    return NextResponse.json({ maker });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { makerId } = await params;
    await deleteMaker(orgId, makerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/makers/route.test.ts "src/app/api/makers/[makerId]/route.test.ts"`
Expected: PASS (4 + 3).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/makers
git commit -m "feat: /api/makers CRUD routes"
```

---

## Task 3: Makers page + manager UI + link

**Files:**
- Create: `src/app/makers/page.tsx`
- Create: `src/components/MakersManager.tsx`
- Modify: `src/app/productions/page.tsx`

No automated test (no React component tests). Verified via tsc/lint + manual.

- [ ] **Step 1: Create the manager component**

Create `src/components/MakersManager.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CAST_COLORS, DEFAULT_CAST_COLOR } from "@/lib/cast-colors";

interface MakerRow {
  id: string;
  name: string;
  color: string;
}

export function MakersManager({ initialMakers }: { initialMakers: MakerRow[] }) {
  const [makers, setMakers] = useState<MakerRow[]>(initialMakers);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CAST_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName, color: newColor }),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => [...prev, { id: maker.id, name: maker.name, color: maker.color }]);
      setNewName("");
      setNewColor(DEFAULT_CAST_COLOR);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add maker");
    }
    setBusy(false);
  }

  async function patch(id: string, body: { name?: string; color?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => prev.map((m) => (m.id === id ? { ...m, name: maker.name, color: maker.color } : m)));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save maker");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this maker? They'll be unassigned from any pieces.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setMakers((prev) => prev.filter((m) => m.id !== id));
    } else {
      setError("Couldn't remove maker");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {makers.length === 0 && <p className="text-sm muted">No makers yet. Add your costume team below.</p>}
      <ul className="space-y-2">
        {makers.map((m) => (
          <li key={m.id} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
            <input
              className="field min-w-0 flex-1"
              defaultValue={m.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && patch(m.id, { name: e.target.value })}
              aria-label="Maker name"
            />
            <Swatches value={m.color} onChange={(color) => patch(m.id, { color })} />
            <button type="button" onClick={() => remove(m.id)} disabled={busy} className="text-sm text-[var(--red)] hover:underline disabled:opacity-50">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
        <input
          className="field min-w-0 flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a maker (name)"
        />
        <Swatches value={newColor} onChange={setNewColor} />
        <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">
          Add maker
        </button>
      </form>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {CAST_COLORS.map((c) => (
        <button
          key={c.token}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.token}
          title={c.label}
          onClick={() => onChange(c.token)}
          className={`h-5 w-5 rounded-full border border-black/10 ${
            value === c.token ? "outline outline-2 outline-offset-1 outline-[var(--ink)]" : ""
          }`}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/makers/page.tsx`:

```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listMakers } from "@/lib/data/makers";
import { MakersManager } from "@/components/MakersManager";

export default async function MakersPage() {
  const { orgId } = await getAuthContext();
  const makers = await listMakers(orgId);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="font-display text-3xl font-semibold">Makers</h1>
        <p className="mt-1 text-sm muted">
          Your costume team. Assign them to pieces to make, and track who&apos;s done.
        </p>
      </div>
      <MakersManager
        initialMakers={makers.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
      />
    </main>
  );
}
```

- [ ] **Step 3: Add the link on the productions list**

In `src/app/productions/page.tsx`, the top bar actions `<div className="flex items-center gap-2.5">` (around line 44) currently holds the user name + `<UserButton />`. Add a Makers link before the user name:

```tsx
        <div className="flex items-center gap-2.5">
          <Link href="/makers" className="link-muted text-sm">
            Makers
          </Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
```

(`Link` is already imported in this file.)

- [ ] **Step 4: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no NEW lint errors, all tests pass.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (migration 0013 must be applied to the connected Supabase). Verify: open `/makers` via the Productions header link → add a maker with a color → it appears; rename on blur persists (reload); change color persists; remove works.

- [ ] **Step 6: Commit**

```bash
git add src/app/makers src/components/MakersManager.tsx src/app/productions/page.tsx
git commit -m "feat: Makers management page (org roster)"
```

---

## Deploy Note

Adds migration `0013_makers.sql` — apply to the Supabase project on deploy (same flow as prior migrations). Phase 2b (assigning makers to pieces + status) follows in a separate plan and adds `costume_pieces.maker_id` (migration 0014).

## Self-Review Notes

- **Spec coverage (roster portion):** makers table + data layer (Task 1); CRUD API (Task 2); `/makers` page + manager + productions link (Task 3). Assignment/status is deliberately deferred to phase 2b.
- **Type consistency:** `Maker` (`{id, org_id, name, color, created_at}`) in the data layer; routes return `{ maker }` / `{ makers }`; the manager uses a trimmed `{id, name, color}` row shape. `updateMaker(orgId, id, { name?, color? })` signature consistent between data layer, route, and tests.
- **Reuse:** org-scoping mirrors `casts.ts`; `ensureOrganization` guards the FK; color tokens/swatches reuse `cast-colors.ts`.
- **No placeholders:** every code step has complete code; run steps have exact commands + expected results.
