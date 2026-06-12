# Org Fabric Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only org "Fabric" settings area managing a list of fabric widths and a list of suppliers (each with a price/yard), which then pre-fill new costume pieces, supply the AI estimator's blank-width fallback, and back-fill the purchase-list cost rollup.

**Architecture:** Two org-scoped tables (`fabric_widths`, `fabric_suppliers`) mirror the existing `makers` table. A reusable `requireOrgAdmin()` gate (Clerk `orgRole`) protects the write routes. A new "Fabric" tab in the Clerk `OrganizationSwitcher` (mirroring the Makers tab) manages the lists. `loadCostumeCreationsData` is extended to return the lists, threading them to `MakePieceRow` (dropdowns + pre-fill), the estimate-fabric route (width fallback), and `buildFabricPurchaseList` (cost fallback). Pieces keep storing plain strings/numbers — no FK.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (`supabaseAdmin`), Clerk `@clerk/nextjs@7`, Vitest. Spec: `docs/superpowers/specs/2026-06-12-org-fabric-settings-design.md`.

---

## Design decisions locked for this plan

- **Admin check uses `orgRole === "org:admin"`** from Clerk's `auth()` (simpler to test than `has()`; equivalent here). `requireOrgAdmin()` throws `AuthError(403)` otherwise.
- **Single-default invariant** is enforced in the data layer: setting a row's `is_default = true` first clears the prior default in that org+table (a separate `update` pass).
- **Pieces stay string/number-stored.** Dropdowns write the chosen width *string* / supplier *name*; deleting a list row never touches existing pieces.
- **Graceful empty state:** with no widths/suppliers configured, dropdowns fall back to today's plain text inputs, nothing pre-fills, and the AI keeps its 45″ assumption — i.e. exactly current behavior.
- **Route layout mirrors makers:** a top `GET /api/org/fabric-settings`, plus `widths`/`suppliers` collection + `[id]` routes for writes.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/0021_fabric_settings.sql` | **new** — the two tables + indexes. |
| `src/lib/data/fabric-settings.ts` (+ `.test.ts`) | **new** — org-scoped CRUD for widths & suppliers; single-default invariant. |
| `src/lib/auth-context.ts` | add `requireOrgAdmin()` (+ tests in `auth-context.test.ts`, new). |
| `src/app/api/org/fabric-settings/route.ts` | **new** — `GET` lists (any member). |
| `src/app/api/org/fabric-settings/widths/route.ts` + `[id]/route.ts` | **new** — POST / PATCH / DELETE (admin). |
| `src/app/api/org/fabric-settings/suppliers/route.ts` + `[id]/route.ts` | **new** — POST / PATCH / DELETE (admin). |
| `src/components/OrgFabricPanel.tsx` | **new** — the Fabric tab (two list editors). |
| `src/components/OrgSwitcher.tsx` | mount the Fabric tab. |
| `src/lib/data/costume-creations.ts` | return `fabricWidths` + `fabricSuppliers`. |
| `src/components/TailorSummary.tsx`, `MakeWorklist.tsx` | thread the lists to `MakePieceRow`. |
| `src/components/MakePieceRow.tsx` | width/supplier dropdowns, pre-fill, supplier→cost auto-fill. |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` | use org default width as the blank-width fallback. |
| `src/lib/tailor-summary.ts` | `buildFabricPurchaseList` supplier-price cost fallback. |

---

# PHASE A — Settings core (Tasks 1–5)

## Task 1: Migration `0021_fabric_settings.sql`

**Files:**
- Create: `supabase/migrations/0021_fabric_settings.sql`

No automated test (raw SQL). Chris applies it to the shared Supabase project (as with 0019/0020) before Phase B's manual browser check; the data-layer tests are mocked and pass without it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_fabric_settings.sql`:

```sql
-- Org-level fabric settings: a managed list of fabric widths and of suppliers
-- (each with a default price/yard). org_id is the Clerk org id (text), matching makers.
create table if not exists fabric_widths (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  value text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists fabric_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  price_per_yard numeric,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fabric_widths_org_idx on fabric_widths (org_id);
create index if not exists fabric_suppliers_org_idx on fabric_suppliers (org_id);
```

- [ ] **Step 2: Sanity-check the SQL**

Run: `grep -c "create table" supabase/migrations/0021_fabric_settings.sql`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0021_fabric_settings.sql
git commit -m "feat: migration 0021 — fabric_widths + fabric_suppliers tables"
```

---

## Task 2: Data layer — `fabric-settings.ts`

**Files:**
- Create: `src/lib/data/fabric-settings.ts`
- Test: `src/lib/data/fabric-settings.test.ts`

Mirrors `src/lib/data/makers.ts`. Adds the single-default clear.

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/fabric-settings.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

// A chainable Supabase mock: every builder method returns the same chain, the
// chain is awaitable (thenable) and resolves to a settable result, and the
// single/maybeSingle terminals resolve to the same result.
const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "delete", "eq", "order"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn(() => chain);
function setResult(data: unknown, error: unknown = null) {
  result.data = data;
  result.error = error;
}

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listFabricWidths,
  createFabricWidth,
  updateFabricWidth,
  deleteFabricWidth,
  listFabricSuppliers,
  createFabricSupplier,
} from "@/lib/data/fabric-settings";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("listFabricWidths filters by org, oldest-first", async () => {
  setResult([{ id: "w1", org_id: "org_1", value: '54\"', is_default: true }]);
  const rows = await listFabricWidths("org_1");
  expect(from).toHaveBeenCalledWith("fabric_widths");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "w1", org_id: "org_1", value: '54\"', is_default: true }]);
});

test("createFabricWidth inserts a trimmed value scoped to the org", async () => {
  setResult({ id: "w2", org_id: "org_1", value: '60\"', is_default: false });
  const row = await createFabricWidth("org_1", { value: '  60\"  ', isDefault: false });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", value: '60\"', is_default: false });
  expect(row.id).toBe("w2");
});

test("createFabricWidth rejects an empty value", async () => {
  await expect(createFabricWidth("org_1", { value: "  ", isDefault: false })).rejects.toBeInstanceOf(ValidationError);
});

test("createFabricWidth with isDefault clears the prior default first", async () => {
  setResult({ id: "w3", value: '45\"', is_default: true });
  await createFabricWidth("org_1", { value: '45\"', isDefault: true });
  // clear-default pass: update({is_default:false}) scoped to org + is_default true
  expect(chain.update).toHaveBeenCalledWith({ is_default: false });
  expect(chain.eq).toHaveBeenCalledWith("is_default", true);
  // then the insert carries is_default true
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", value: '45\"', is_default: true });
});

test("updateFabricWidth patches value scoped by id and org", async () => {
  setResult({ id: "w1", value: '50\"', is_default: false });
  const row = await updateFabricWidth("org_1", "w1", { value: '50\"' });
  expect(chain.update).toHaveBeenCalledWith({ value: '50\"' });
  expect(chain.eq).toHaveBeenCalledWith("id", "w1");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(row.value).toBe('50\"');
});

test("updateFabricWidth throws NotFound when the row is missing", async () => {
  setResult(null);
  await expect(updateFabricWidth("org_1", "missing", { value: '50\"' })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteFabricWidth scopes by id and org", async () => {
  setResult(null);
  await deleteFabricWidth("org_1", "w1");
  expect(from).toHaveBeenCalledWith("fabric_widths");
  expect(chain.delete).toHaveBeenCalled();
  expect(chain.eq).toHaveBeenCalledWith("id", "w1");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
});

test("listFabricSuppliers reads the suppliers table", async () => {
  setResult([{ id: "s1", org_id: "org_1", name: "Mood", price_per_yard: 4, is_default: true }]);
  const rows = await listFabricSuppliers("org_1");
  expect(from).toHaveBeenCalledWith("fabric_suppliers");
  expect(rows[0].name).toBe("Mood");
});

test("createFabricSupplier inserts name + price, defaulting price to null", async () => {
  setResult({ id: "s2", org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false });
  await createFabricSupplier("org_1", { name: "  JOANN  ", pricePerYard: null, isDefault: false });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false });
});

test("createFabricSupplier rejects an empty name", async () => {
  await expect(createFabricSupplier("org_1", { name: " ", pricePerYard: 2, isDefault: false })).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/fabric-settings.test.ts`
Expected: FAIL — module `@/lib/data/fabric-settings` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/fabric-settings.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface FabricWidth {
  id: string;
  org_id: string;
  value: string;
  is_default: boolean;
  created_at: string;
}

export interface FabricSupplier {
  id: string;
  org_id: string;
  name: string;
  price_per_yard: number | null;
  is_default: boolean;
  created_at: string;
}

// Clear the existing default in a list so only one row is is_default at a time.
async function clearDefault(table: "fabric_widths" | "fabric_suppliers", orgId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table)
    .update({ is_default: false })
    .eq("org_id", orgId)
    .eq("is_default", true);
  if (error) throw new Error(error.message);
}

// --- Widths ---

export async function listFabricWidths(orgId: string): Promise<FabricWidth[]> {
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FabricWidth[];
}

export async function createFabricWidth(
  orgId: string,
  input: { value: string; isDefault: boolean },
): Promise<FabricWidth> {
  const value = input.value.trim();
  if (!value) throw new ValidationError("Width is required");
  if (input.isDefault) await clearDefault("fabric_widths", orgId);
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .insert({ org_id: orgId, value, is_default: input.isDefault })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FabricWidth;
}

export async function updateFabricWidth(
  orgId: string,
  id: string,
  patch: { value?: string; isDefault?: boolean },
): Promise<FabricWidth> {
  const update: { value?: string; is_default?: boolean } = {};
  if (patch.value !== undefined) {
    const trimmed = patch.value.trim();
    if (!trimmed) throw new ValidationError("Width is required");
    update.value = trimmed;
  }
  if (patch.isDefault === true) {
    await clearDefault("fabric_widths", orgId);
    update.is_default = true;
  } else if (patch.isDefault === false) {
    update.is_default = false;
  }
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Width not found");
  return data as FabricWidth;
}

export async function deleteFabricWidth(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fabric_widths")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

// --- Suppliers ---

export async function listFabricSuppliers(orgId: string): Promise<FabricSupplier[]> {
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FabricSupplier[];
}

export async function createFabricSupplier(
  orgId: string,
  input: { name: string; pricePerYard: number | null; isDefault: boolean },
): Promise<FabricSupplier> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Supplier name is required");
  if (input.isDefault) await clearDefault("fabric_suppliers", orgId);
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .insert({ org_id: orgId, name, price_per_yard: input.pricePerYard, is_default: input.isDefault })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FabricSupplier;
}

export async function updateFabricSupplier(
  orgId: string,
  id: string,
  patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean },
): Promise<FabricSupplier> {
  const update: { name?: string; price_per_yard?: number | null; is_default?: boolean } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Supplier name is required");
    update.name = trimmed;
  }
  if (patch.pricePerYard !== undefined) update.price_per_yard = patch.pricePerYard;
  if (patch.isDefault === true) {
    await clearDefault("fabric_suppliers", orgId);
    update.is_default = true;
  } else if (patch.isDefault === false) {
    update.is_default = false;
  }
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Supplier not found");
  return data as FabricSupplier;
}

export async function deleteFabricSupplier(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fabric_suppliers")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/fabric-settings.test.ts`
Expected: PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/fabric-settings.ts src/lib/data/fabric-settings.test.ts
git commit -m "feat: fabric-settings data layer (widths + suppliers, single-default)"
```

---

## Task 3: `requireOrgAdmin()` auth helper

**Files:**
- Modify: `src/lib/auth-context.ts`
- Test: `src/lib/auth-context.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth-context.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const auth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));

import { requireOrgAdmin, AuthError } from "@/lib/auth-context";

beforeEach(() => auth.mockReset());

test("requireOrgAdmin returns context for an org admin", async () => {
  auth.mockResolvedValue({ userId: "u1", orgId: "org_1", orgRole: "org:admin" });
  await expect(requireOrgAdmin()).resolves.toEqual({ userId: "u1", orgId: "org_1" });
});

test("requireOrgAdmin rejects a non-admin member with 403", async () => {
  auth.mockResolvedValue({ userId: "u1", orgId: "org_1", orgRole: "org:member" });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 403 });
});

test("requireOrgAdmin rejects when signed out with 401", async () => {
  auth.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 401 });
});

test("requireOrgAdmin rejects when there is no active org with 403", async () => {
  auth.mockResolvedValue({ userId: "u1", orgId: null, orgRole: null });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 403 });
});

test("AuthError is exported and carries a status", () => {
  expect(new AuthError(403, "x").status).toBe(403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth-context.test.ts`
Expected: FAIL — `requireOrgAdmin` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/auth-context.ts`, after the existing `getAuthContext` function, add:

```ts
// Like getAuthContext, but also asserts the caller is an org Admin (Clerk role).
// Used by the org fabric-settings write routes.
export async function requireOrgAdmin(): Promise<AuthContext> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) throw new AuthError(401, "Not signed in");
  if (!orgId) throw new AuthError(403, "No active organization");
  if (orgRole !== "org:admin") throw new AuthError(403, "Admin access required");
  return { userId, orgId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth-context.test.ts`
Expected: PASS (5 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-context.ts src/lib/auth-context.test.ts
git commit -m "feat: requireOrgAdmin() gate (Clerk org:admin role)"
```

---

## Task 4: API routes — `/api/org/fabric-settings`

**Files:**
- Create: `src/app/api/org/fabric-settings/route.ts` (+ `route.test.ts`)
- Create: `src/app/api/org/fabric-settings/widths/route.ts`
- Create: `src/app/api/org/fabric-settings/widths/[id]/route.ts`
- Create: `src/app/api/org/fabric-settings/suppliers/route.ts`
- Create: `src/app/api/org/fabric-settings/suppliers/[id]/route.ts`

Mirrors the makers routes. GET is member-open; writes use `requireOrgAdmin`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/org/fabric-settings/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const requireOrgAdmin = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext(), requireOrgAdmin: () => requireOrgAdmin() };
});

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: (...a: unknown[]) => ensureOrganization(...a) }));

const listFabricWidths = vi.fn();
const listFabricSuppliers = vi.fn();
const createFabricWidth = vi.fn();
vi.mock("@/lib/data/fabric-settings", () => ({
  listFabricWidths: (...a: unknown[]) => listFabricWidths(...a),
  listFabricSuppliers: (...a: unknown[]) => listFabricSuppliers(...a),
  createFabricWidth: (...a: unknown[]) => createFabricWidth(...a),
}));

import { GET } from "@/app/api/org/fabric-settings/route";
import { POST } from "@/app/api/org/fabric-settings/widths/route";

beforeEach(() => {
  [getAuthContext, requireOrgAdmin, ensureOrganization, listFabricWidths, listFabricSuppliers, createFabricWidth].forEach((m) => m.mockReset());
});

const jsonReq = (body: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("GET returns both lists for any member", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listFabricWidths.mockResolvedValue([{ id: "w1", value: '54\"' }]);
  listFabricSuppliers.mockResolvedValue([{ id: "s1", name: "Mood", price_per_yard: 4 }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ widths: [{ id: "w1", value: '54\"' }], suppliers: [{ id: "s1", name: "Mood", price_per_yard: 4 }] });
  expect(listFabricWidths).toHaveBeenCalledWith("org_1");
});

test("POST widths creates a width as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricWidth.mockResolvedValue({ id: "w2", value: '60\"', is_default: false });
  const res = await POST(jsonReq({ value: '60\"', isDefault: false }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalled();
  expect(createFabricWidth).toHaveBeenCalledWith("org_1", { value: '60\"', isDefault: false });
});

test("POST widths is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await POST(jsonReq({ value: '60\"' }));
  expect(res.status).toBe(403);
  expect(createFabricWidth).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/org/fabric-settings/route.test.ts`
Expected: FAIL — route modules do not exist.

- [ ] **Step 3: Write the implementations**

Create `src/app/api/org/fabric-settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listFabricWidths, listFabricSuppliers } from "@/lib/data/fabric-settings";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const [widths, suppliers] = await Promise.all([listFabricWidths(orgId), listFabricSuppliers(orgId)]);
    return NextResponse.json({ widths, suppliers });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/org/fabric-settings/widths/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { createFabricWidth } from "@/lib/data/fabric-settings";

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const body = (await request.json()) as { value?: string; isDefault?: boolean; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const width = await createFabricWidth(orgId, {
      value: typeof body.value === "string" ? body.value : "",
      isDefault: body.isDefault === true,
    });
    return NextResponse.json({ width }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/org/fabric-settings/widths/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { updateFabricWidth, deleteFabricWidth } from "@/lib/data/fabric-settings";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    const body = (await request.json()) as { value?: string; isDefault?: boolean };
    const patch: { value?: string; isDefault?: boolean } = {};
    if (typeof body.value === "string") patch.value = body.value;
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    const width = await updateFabricWidth(orgId, id, patch);
    return NextResponse.json({ width });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    await deleteFabricWidth(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/org/fabric-settings/suppliers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { createFabricSupplier } from "@/lib/data/fabric-settings";

// Parse a price field: a finite number ≥ 0, else null.
function parsePrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const supplier = await createFabricSupplier(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      pricePerYard: parsePrice(body.pricePerYard),
      isDefault: body.isDefault === true,
    });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Create `src/app/api/org/fabric-settings/suppliers/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { updateFabricSupplier, deleteFabricSupplier } from "@/lib/data/fabric-settings";

type Ctx = { params: Promise<{ id: string }> };

function parsePrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean };
    const patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.pricePerYard !== undefined) patch.pricePerYard = parsePrice(body.pricePerYard);
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    const supplier = await updateFabricSupplier(orgId, id, patch);
    return NextResponse.json({ supplier });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    await deleteFabricSupplier(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/org/fabric-settings/route.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/org/fabric-settings
git commit -m "feat: fabric-settings API routes (member GET; admin writes)"
```

---

## Task 5: Org "Fabric" settings tab UI

**Files:**
- Create: `src/components/OrgFabricPanel.tsx`
- Modify: `src/components/OrgSwitcher.tsx`

UI task — no unit test; verify with `tsc` + `lint` + `build`, then the Phase B manual check. Mirrors `OrgMakersPanel`. The panel is client-side; it reads `GET /api/org/fabric-settings` and writes via the collection/[id] routes. Read `src/components/OrgMakersPanel.tsx` and `src/components/MakersManager.tsx` first to match the established editor style (inputs, buttons, `field`/`btn-primary`/`muted` classes, `credentials: "include"`).

- [ ] **Step 1: Create the panel**

Create `src/components/OrgFabricPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Width = { id: string; value: string; is_default: boolean };
type Supplier = { id: string; name: string; price_per_yard: number | null; is_default: boolean };

export function FabricTabIcon() {
  // Spool-of-thread glyph for the custom profile-page label.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="6" y1="16" x2="18" y2="16" />
    </svg>
  );
}

export function OrgFabricPanel() {
  const [widths, setWidths] = useState<Width[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWidth, setNewWidth] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/org/fabric-settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { widths?: Width[]; suppliers?: Supplier[] }) => {
        if (!active) return;
        setWidths(d.widths ?? []);
        setSuppliers(d.suppliers ?? []);
      })
      .catch(() => active && setError("Couldn't load fabric settings."));
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    const r = await fetch("/api/org/fabric-settings", { credentials: "include" });
    if (r.ok) {
      const d = (await r.json()) as { widths?: Width[]; suppliers?: Supplier[] };
      setWidths(d.widths ?? []);
      setSuppliers(d.suppliers ?? []);
    }
  }

  async function send(path: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Action failed (admins only).");
      return false;
    }
    await reload();
    return true;
  }

  async function addWidth() {
    if (!newWidth.trim()) return;
    if (await send("/api/org/fabric-settings/widths", "POST", { value: newWidth })) setNewWidth("");
  }

  async function addSupplier() {
    if (!newSupplier.trim()) return;
    const price = newPrice.trim() === "" ? null : Number(newPrice);
    if (await send("/api/org/fabric-settings/suppliers", "POST", { name: newSupplier, pricePerYard: price })) {
      setNewSupplier("");
      setNewPrice("");
    }
  }

  if (error && !widths) return <p className="text-sm text-[var(--red)]">{error}</p>;
  if (!widths || !suppliers) return <p className="text-sm muted">Loading fabric settings…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Fabric settings</h2>
        <p className="mt-1 text-sm muted">Defaults that seed new pieces and the AI yardage estimate. Admins only.</p>
      </div>

      <section>
        <h3 className="mb-2 font-medium">Widths</h3>
        <ul className="space-y-1">
          {widths.map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{w.value}</span>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/widths/${w.id}`, "PATCH", { isDefault: true })}>
                {w.is_default ? "★ default" : "set default"}
              </button>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/widths/${w.id}`, "DELETE")}>
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input className="field !p-1.5 text-sm" value={newWidth} onChange={(e) => setNewWidth(e.target.value)} placeholder='e.g. 54"' />
          <button type="button" className="btn-primary" onClick={() => void addWidth()}>Add width</button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Suppliers</h3>
        <ul className="space-y-1">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{s.name}</span>
              <span className="muted">{s.price_per_yard != null ? `$${s.price_per_yard}/yd` : "—"}</span>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "PATCH", { isDefault: true })}>
                {s.is_default ? "★ default" : "set default"}
              </button>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "DELETE")}>
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="field !p-1.5 text-sm" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Supplier name" />
          <input className="field !p-1.5 text-sm w-28" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" placeholder="$/yd" />
          <button type="button" className="btn-primary" onClick={() => void addSupplier()}>Add supplier</button>
        </div>
      </section>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Mount the tab in `OrgSwitcher.tsx`**

In `src/components/OrgSwitcher.tsx`, add the import and a second profile page. Update the imports line and the JSX:

```tsx
import { OrganizationSwitcher } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { MakersTabIcon, OrgMakersPanel } from "@/components/OrgMakersPanel";
import { FabricTabIcon, OrgFabricPanel } from "@/components/OrgFabricPanel";

export function OrgSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterSelectOrganizationUrl="/productions"
      afterCreateOrganizationUrl="/productions"
      appearance={clerkAppearance}
    >
      <OrganizationSwitcher.OrganizationProfilePage label="Makers" labelIcon={<MakersTabIcon />} url="makers">
        <OrgMakersPanel />
      </OrganizationSwitcher.OrganizationProfilePage>
      <OrganizationSwitcher.OrganizationProfilePage label="Fabric" labelIcon={<FabricTabIcon />} url="fabric">
        <OrgFabricPanel />
      </OrganizationSwitcher.OrganizationProfilePage>
    </OrganizationSwitcher>
  );
}
```

Note: Clerk shows the custom profile pages to members, but every write endpoint is guarded by `requireOrgAdmin`, so a non-admin who opens the tab sees the lists read-only and any add/remove/default action surfaces the 403 message. (Hiding the tab entirely for members is a possible later refinement; the data is non-sensitive and the writes are safely gated.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npm run lint` → clean.
Run: `npx vitest run` → all pass (Phase A tests included).
Run: `npm run build` → succeeds (note the result).

- [ ] **Step 4: Commit**

```bash
git add src/components/OrgFabricPanel.tsx src/components/OrgSwitcher.tsx
git commit -m "feat: org Fabric settings tab (widths + suppliers editor)"
```

---

# PHASE B — Consumer wiring (Tasks 6–9)

## Task 6: Load the lists into Costume Creations data + thread props

**Files:**
- Modify: `src/lib/data/costume-creations.ts`
- Modify: `src/components/TailorSummary.tsx`
- Modify: `src/components/MakeWorklist.tsx`

This task only *threads* the lists to `MakePieceRow` (Task 7 adds the behavior). No new test — `tsc` proves the wiring; existing tests must stay green.

- [ ] **Step 1: Extend `loadCostumeCreationsData`**

In `src/lib/data/costume-creations.ts`, add the imports and load the lists. At the top, add:

```ts
import { listFabricWidths, listFabricSuppliers } from "@/lib/data/fabric-settings";
```

Inside `loadCostumeCreationsData`, after `const makers = await listMakers(orgId);`, add:

```ts
  const [fabricWidths, fabricSuppliers] = await Promise.all([
    listFabricWidths(orgId),
    listFabricSuppliers(orgId),
  ]);
```

Then in the returned object, after `makers: makers.map(...)`, add:

```ts
    fabricWidths: fabricWidths.map((w) => ({ id: w.id, value: w.value, isDefault: w.is_default })),
    fabricSuppliers: fabricSuppliers.map((s) => ({ id: s.id, name: s.name, pricePerYard: s.price_per_yard, isDefault: s.is_default })),
```

- [ ] **Step 2: Add a shared type for the settings and thread through `TailorSummary`**

In `src/components/TailorSummary.tsx`, add these prop types to the interface (after `makers`) in BOTH the destructure and the type literal:

```tsx
  fabricWidths,
  fabricSuppliers,
```

and in the type:

```tsx
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
```

Then pass them into `<MakeWorklist ... />` (add the two props alongside `makers`):

```tsx
          fabricWidths={fabricWidths}
          fabricSuppliers={fabricSuppliers}
```

- [ ] **Step 3: Thread through `MakeWorklist`**

In `src/components/MakeWorklist.tsx`, add `fabricWidths` and `fabricSuppliers` to the component's props (both the outer `MakeWorklist` and the inner role component that renders rows — mirror exactly how `makers` is declared and forwarded), with the type:

```tsx
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
```

and forward them to `<MakePieceRow ... />` next to `makers={makers}`:

```tsx
                    fabricWidths={fabricWidths}
                    fabricSuppliers={fabricSuppliers}
```

(At this point `MakePieceRow` doesn't accept these props yet — Step 4 makes `tsc` pass by adding them as accepted-but-unused, then Task 7 uses them. To keep this task green, add them to `MakePieceRow`'s prop signature now as accepted props, unused.)

- [ ] **Step 4: Add the props to `MakePieceRow`'s signature (unused for now)**

In `src/components/MakePieceRow.tsx`, add to the destructure and prop type (after `makers`):

```tsx
  fabricWidths,
  fabricSuppliers,
```
```tsx
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
```

Reference them once to satisfy lint (temporary, removed in Task 7) — or better, proceed directly to Task 7 in the same session so they're used. If committing here, add `void fabricWidths; void fabricSuppliers;` at the top of the function body to avoid unused-var lint errors.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green (no behavior change). `npm run lint` → clean.

```bash
git add src/lib/data/costume-creations.ts src/components/TailorSummary.tsx src/components/MakeWorklist.tsx src/components/MakePieceRow.tsx
git commit -m "chore: thread org fabric lists into the make worklist"
```

---

## Task 7: `MakePieceRow` — dropdowns, pre-fill, supplier→cost auto-fill

**Files:**
- Modify: `src/components/MakePieceRow.tsx`

No unit test (UI behavior; the data/route seams are tested). Verify with `tsc`/`lint`/`build` + the manual check. Read the current `MakePieceRow.tsx` fully first.

- [ ] **Step 1: Initialize empty fabric fields from the org defaults (pre-fill)**

In `MakePieceRow.tsx`, replace the `width`, `supplier`, and `unitCost` state initializers so an empty field starts from the org default. Compute the defaults just above the `useState` calls:

```tsx
  const defaultWidth = fabricWidths.find((w) => w.isDefault)?.value ?? "";
  const defaultSupplier = fabricSuppliers.find((s) => s.isDefault) ?? null;
```

Then change the three initializers:

```tsx
  const [width, setWidth] = useState(item.fabric.width ?? defaultWidth);
  const [supplier, setSupplier] = useState(item.fabric.supplier ?? (defaultSupplier?.name ?? ""));
  const [unitCost, setUnitCost] = useState(
    item.fabric.unitCost != null
      ? String(item.fabric.unitCost)
      : defaultSupplier?.pricePerYard != null
        ? String(defaultSupplier.pricePerYard)
        : "",
  );
```

(`type`, `color`, `yardage` initializers stay as they are.)

- [ ] **Step 2: Replace the Width text field with a dropdown (preserving off-list values)**

Replace the Width `<Field .../>` line with a `<SelectField>` when widths exist, else keep the text `Field`. Add this just before the `return` of the row, a helper that builds the option list (current value first if off-list):

In the JSX `grid`, replace:

```tsx
            <Field label="Width" value={width} onChange={setWidth} onBlur={() => void save()} placeholder="Inches" />
```

with:

```tsx
            {fabricWidths.length > 0 ? (
              <SelectField
                label="Width"
                value={width}
                options={optionValues(fabricWidths.map((w) => w.value), width)}
                onChange={(v) => { setWidth(v); void save(); }}
              />
            ) : (
              <Field label="Width" value={width} onChange={setWidth} onBlur={() => void save()} placeholder="Inches" />
            )}
```

- [ ] **Step 3: Replace the Supplier text field with a dropdown that auto-fills cost**

Replace:

```tsx
            <Field label="Supplier" value={supplier} onChange={setSupplier} onBlur={() => void save()} placeholder="Where to buy" />
```

with:

```tsx
            {fabricSuppliers.length > 0 ? (
              <SelectField
                label="Supplier"
                value={supplier}
                options={optionValues(fabricSuppliers.map((s) => s.name), supplier)}
                onChange={(v) => {
                  setSupplier(v);
                  // Auto-fill the per-yard cost from the chosen supplier, but never
                  // clobber a price the user already typed.
                  const picked = fabricSuppliers.find((s) => s.name === v);
                  if (picked?.pricePerYard != null && unitCost.trim() === "") {
                    setUnitCost(String(picked.pricePerYard));
                  }
                  void save();
                }}
              />
            ) : (
              <Field label="Supplier" value={supplier} onChange={setSupplier} onBlur={() => void save()} placeholder="Where to buy" />
            )}
```

Note: `save()` reads the latest `unitCost`/`supplier` state on its next microtask via the existing chain; if a same-tick read is a concern, pass the values explicitly — but `save()` already closes over current state and is called after `setUnitCost`, which is sufficient here because React batches and `save` captures via the chained promise. If tests/manual show a stale value, change `save()` to accept `{ width?, supplier?, unitCost? }` overrides mirroring its existing `{ made?, makerId? }` pattern and pass the picked values. (Implementer: prefer the explicit-override approach if unsure — it matches the existing `save(opts)` design and is race-free.)

- [ ] **Step 4: Add the `SelectField` component and `optionValues` helper**

At the bottom of `MakePieceRow.tsx` (next to the existing `Field` function), add:

```tsx
// Build a <select>'s option list: a leading blank, the org list, and the current
// value if it isn't already in the list (so an old free-typed value isn't lost).
function optionValues(list: string[], current: string): string[] {
  const out = [...list];
  if (current && !out.includes(current)) out.unshift(current);
  return out;
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <select className="field !p-1.5 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → clean. `npm run lint` → clean (remove the temporary `void fabricWidths; void fabricSuppliers;` from Task 6 Step 4 now that they're used). `npx vitest run` → all green. `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/MakePieceRow.tsx
git commit -m "feat: fabric width/supplier dropdowns + default pre-fill on make pieces"
```

---

## Task 8: AI estimate — org default width fallback

**Files:**
- Modify: `src/app/api/productions/[id]/estimate-fabric/route.ts`
- Modify: `src/app/api/productions/[id]/estimate-fabric/route.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/app/api/productions/[id]/estimate-fabric/route.test.ts`, the `dataWith` helper returns the loader shape. Update it to include the new lists (default to empty), then add a test. First, change `dataWith` to accept optional widths and include them — replace the `dataWith` definition with:

```ts
const dataWith = (initialPieces: PieceRow[], fabricWidths: { id: string; value: string; isDefault: boolean }[] = []) => ({
  roles: [{ id: "r1", name: "Lead", notes: null }],
  designs: [{ id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null }],
  castings: [{ id: "c1", cast_id: "cast1", role_id: "r1", performer_id: "pf1", assignment: "primary" }],
  performers: [{ id: "pf1", name: "Ana" }],
  casts: [{ id: "cast1", name: "Cast A" }],
  initialPieces,
  measurementsByCasting: { c1: [{ key: "height", label: "Height", value: 70, unit: "in" }] },
  fabricWidths,
  fabricSuppliers: [],
});
```

Then add this test:

```ts
test("uses the org default width as the fallback for a piece with no width", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(
    dataWith([], [{ id: "w1", value: '54\"', isDefault: true }]),
  );
  estimateFabricYardage.mockResolvedValue(new Map([["c1:d1", 3.5]]));
  upsertPieceSource.mockResolvedValue(piece({ fabric_yardage: 3.5 }));
  listCostumePieces.mockResolvedValue([piece({ fabric_yardage: 3.5 })]);

  await POST(req(), ctx("p1"));

  expect(estimateFabricYardage).toHaveBeenCalledWith([
    expect.objectContaining({ key: "c1:d1", garment: "Cloak", fabricWidth: '54\"' }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`
Expected: FAIL — the new test sees `fabricWidth: null` (the route still ignores the org default).

- [ ] **Step 3: Implement the fallback**

In `src/app/api/productions/[id]/estimate-fabric/route.ts`, just after building `worklist` and before the `toEstimate` loop, compute the default width:

```ts
    const defaultWidth = data.fabricWidths.find((w) => w.isDefault)?.value ?? null;
```

Then in the `EstimateItem` push, change the `fabricWidth` line from:

```ts
            fabricWidth: item.fabric.width,
```

to:

```ts
            fabricWidth: item.fabric.width ?? defaultWidth,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`
Expected: PASS (all, including the existing ones — the others pass `dataWith(...)` with the default empty `fabricWidths`, so `defaultWidth` is `null` and `item.fabric.width ?? null` is unchanged). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/estimate-fabric/route.ts" "src/app/api/productions/[id]/estimate-fabric/route.test.ts"
git commit -m "feat: estimate-fabric uses the org default width as the blank-width fallback"
```

---

## Task 9: Purchase list — supplier-price cost fallback

**Files:**
- Modify: `src/lib/tailor-summary.ts`
- Test: `src/lib/tailor-summary.test.ts`

`buildFabricPurchaseList(items)` gains an optional supplier-price map; a piece with no `unitCost` is valued at its supplier's price.

- [ ] **Step 1: Add the failing test**

In `src/lib/tailor-summary.test.ts`, add (adjust the item factory to whatever the file already uses — match its existing `MakeItem` construction; the key assertion is the cost):

```ts
test("buildFabricPurchaseList falls back to the supplier's price when a piece has no unit cost", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1",
    castingId: "c1",
    performerId: "pf1",
    performerName: "Ana",
    castName: "A",
    assignment: "primary" as const,
    made: false,
    makerId: null,
    fabric: { type: "Wool", color: "Black", width: '60\"', supplier: "Mood", yardage: 2, unitCost: null },
  };
  const list = buildFabricPurchaseList([item], { Mood: 4 });
  expect(list.totalCost).toBe(8); // 2 yd * $4 (from the supplier map)
});

test("buildFabricPurchaseList still treats unknown/absent supplier price as 0", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null,
    fabric: { type: "Wool", color: "Black", width: null, supplier: "Unknown", yardage: 2, unitCost: null },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(0);
  expect(buildFabricPurchaseList([item]).totalCost).toBe(0); // no map → today's behavior
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `buildFabricPurchaseList` takes one argument; the supplier-price fallback isn't applied (totalCost is 0, not 8).

- [ ] **Step 3: Implement the fallback**

In `src/lib/tailor-summary.ts`, change the `buildFabricPurchaseList` signature and the cost computation. Update the signature:

```ts
export function buildFabricPurchaseList(
  items: MakeItem[],
  supplierPrices: Record<string, number> = {},
): PurchaseList {
```

Then where it currently computes `const cost = yardage * (item.fabric.unitCost ?? 0);`, replace with:

```ts
    const effectiveUnitCost =
      item.fabric.unitCost ?? (item.fabric.supplier ? supplierPrices[item.fabric.supplier.trim()] : undefined) ?? 0;
    const cost = yardage * effectiveUnitCost;
```

- [ ] **Step 4: Thread the map from the component**

In `src/components/TailorSummary.tsx`, where `purchase` is built, pass a supplier-price map derived from `fabricSuppliers`. Replace the `purchase` memo body:

```tsx
  const purchase = useMemo(() => {
    const items = worklist.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
    const supplierPrices: Record<string, number> = {};
    for (const s of fabricSuppliers) if (s.pricePerYard != null) supplierPrices[s.name] = s.pricePerYard;
    return buildFabricPurchaseList(items, supplierPrices);
  }, [worklist, fabricSuppliers]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/tailor-summary.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green. `npm run lint` → clean. `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts src/components/TailorSummary.tsx
git commit -m "feat: purchase-list cost falls back to the supplier's price/yd"
```

---

## Verification (manual, after migration 0021 is applied)

Chris applies `0021` to the shared Supabase project first. Then, in an authenticated browser:

1. **As an org Admin:** open the org menu → **Fabric** tab. Add widths (e.g. `45"`, `54"`, `60"`), mark one default. Add suppliers with prices (e.g. Mood $4, JOANN $2.99), mark one default.
2. Open a production → **Costume Creations** → **To make** tab → expand a make piece. Confirm Width and Supplier are **dropdowns** of your lists; a brand-new piece shows the **default** width/supplier and the supplier's price pre-filled. Pick a different supplier → the $/yd fills from that supplier (but a price you typed isn't overwritten).
3. On the **Fabric list** tab, click **✨ Estimate fabric** for pieces with blank width → the estimate uses your default width (not 45″). Confirm purchase-list **costs** reflect supplier prices even for pieces where you didn't type a $/yd.
4. **As a non-admin member:** the Fabric tab's add/remove/default actions fail with an "admins only" message; the per-piece dropdowns still work (GET is open).
5. Confirm an **org with no fabric settings** behaves exactly as before (plain width/supplier text inputs, 45″ AI assumption, no pre-fill).

## Self-Review (completed by plan author)

- **Spec coverage:** §1 data model → Task 1 (0021) + Task 2 (types/CRUD/single-default). §2 data layer → Task 2. §3 `requireOrgAdmin` → Task 3. §4 API (member GET / admin writes) → Task 4. §5 settings UI + tab mount → Task 5. §6 wiring: loader → Task 6; AI width fallback → Task 8; pre-fill + dropdowns + supplier auto-fill → Task 7; cost rollup fallback → Task 9. Testing/edge cases → tests in Tasks 2–4, 8, 9 + manual steps 1–5. Graceful empty state → covered by Task 7's `length > 0` guards, Task 8's `?? null`, Task 9's `?? 0` and manual step 5.
- **Placeholder scan:** none — every code step has full code. The Task 7 Step 3 note about `save()` overrides is a deliberate, explained implementer guardrail (with a concrete fallback), not a TBD.
- **Type consistency:** the settings prop shape `{ id; value; isDefault }` (widths) and `{ id; name; pricePerYard; isDefault }` (suppliers) is identical across the loader return (Task 6 maps DB `is_default`/`price_per_yard` → camel), `TailorSummary`, `MakeWorklist`, `MakePieceRow`, and the route/test (Task 8). The data layer's snake_case row types (`FabricWidth`/`FabricSupplier`) are internal to the data/API layer; the camelCase view shape is what crosses into components. `buildFabricPurchaseList(items, supplierPrices?)` matches between Task 9's impl, test, and the `TailorSummary` caller.
- **Sequencing note:** Tasks 6 + 7 are tightly coupled (6 threads unused props, 7 uses them). If executed as separate commits, Task 6 includes the temporary `void` references to stay lint-clean; Task 7 removes them. Prefer running them back-to-back.
```
