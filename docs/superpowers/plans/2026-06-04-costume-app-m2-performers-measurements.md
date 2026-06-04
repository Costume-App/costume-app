# Costume App — Milestone 2 · Slice 1: Performers & Measurements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a production card open a **production detail page** where you can add cast members (performers) and record each performer's body measurements, all scoped to the active org.

**Architecture:** Builds on the M1 foundation (Next 16 App Router, Clerk auth + Organizations, Supabase service-role data layer, Vitest). Server components fetch through a thin data layer; client components mutate through auth-checked Route Handlers. Production-scoped resources are gated by confirming the production belongs to the caller's active org. Pure logic and the data layer are unit-tested; pages are verified by running the app.

**Tech Stack:** Next.js 16, TypeScript (strict), Tailwind 4, Clerk, Supabase (`@supabase/supabase-js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-costume-app-design.md` — §4 (`measurement_definitions`, `performers`, `performer_measurements`), §6 (auth/org scoping), §7 (Cast/Performers + Measurements screens). This slice intentionally defers roles, casts, castings, costume designs, the fabric engine, and the in/cm toggle to later slices (spec §9 steps 3–5).

> **Scope note:** Performers belong directly to a production in this slice (the spec keeps `performers.production_id`); roles/casts/castings get layered on top later without reworking this. Measurements are stored with the unit declared by each definition (e.g. "Waist (in)"); the in/cm conversion toggle is deferred.

---

## File structure

```
supabase/migrations/0002_performers.sql        # measurement_definitions, performers, performer_measurements (+ seed)
src/lib/
├── errors.ts                                   # MODIFY: add NotFoundError
├── api.ts                                       # NEW: shared errorResponse()
├── api.test.ts                                  # NEW
└── data/
    ├── productions.ts                           # MODIFY: add getProduction()
    ├── production-access.ts                     # NEW: assertProductionInOrg()
    ├── production-access.test.ts                # NEW
    ├── measurement-definitions.ts              # NEW: listMeasurementDefinitions()
    ├── measurement-definitions.test.ts         # NEW
    ├── performers.ts                            # NEW: list/create/delete performers, get/upsert measurements
    └── performers.test.ts                       # NEW
src/app/
├── api/productions/route.ts                     # MODIFY: use shared errorResponse
├── api/productions/[id]/performers/route.ts     # NEW: GET list / POST create
├── api/performers/[performerId]/route.ts        # NEW: DELETE
├── api/performers/[performerId]/measurements/route.ts  # NEW: GET / PUT (upsert one)
├── productions/page.tsx                          # MODIFY: link each card to detail
├── productions/[id]/page.tsx                     # NEW: production detail (server) + performers list
└── productions/[id]/performers/[performerId]/page.tsx  # NEW: measurement entry (server shell)
src/components/
├── PerformerList.tsx                            # NEW: client — add/remove performers
└── MeasurementForm.tsx                          # NEW: client — autosave per field
```

---

## Task 1: DB migration — measurement_definitions, performers, performer_measurements

**Files:**
- Create: `supabase/migrations/0002_performers.sql`

- [ ] **Step 1: Write the migration (schema + seed)**

Create `supabase/migrations/0002_performers.sql`:
```sql
-- Standard body-measurement field definitions (data-driven; Nada refines later).
create table if not exists measurement_definitions (
  key           text primary key,
  label         text not null,
  unit          text not null,            -- e.g. 'in', 'lb'
  input_type    text not null default 'number',
  help_text     text,
  display_order int  not null
);

-- Cast members for a production. No photos; just a label + measurements.
create table if not exists performers (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  label         text not null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists performers_production_id_idx on performers(production_id);

-- One row per (performer, measurement). value stored in the definition's unit.
create table if not exists performer_measurements (
  id              uuid primary key default gen_random_uuid(),
  performer_id    uuid not null references performers(id) on delete cascade,
  measurement_key text not null references measurement_definitions(key),
  value_numeric   numeric not null,
  unit            text not null,
  updated_at      timestamptz not null default now(),
  unique (performer_id, measurement_key)
);

-- Seed the standard set (TO BE CONFIRMED by Nada against her 4-page intake form).
insert into measurement_definitions (key, label, unit, help_text, display_order) values
  ('height',        'Height',         'in', 'Total height, no shoes',                 10),
  ('weight',        'Weight',         'lb', 'Approximate body weight',                20),
  ('chest',         'Chest / bust',   'in', 'Around the fullest part',                30),
  ('waist',         'Waist',          'in', 'Around the natural waistline',           40),
  ('hips',          'Hips',           'in', 'Around the fullest part of the hips',    50),
  ('shoulder',      'Shoulder width', 'in', 'Seam to seam across the back',           60),
  ('sleeve',        'Sleeve length',  'in', 'Shoulder to wrist, arm slightly bent',   70),
  ('back_length',   'Back length',    'in', 'Nape of neck to natural waist',          80),
  ('inseam',        'Inseam',         'in', 'Crotch to ankle',                        90),
  ('outseam',       'Outseam',        'in', 'Waist to ankle',                        100)
on conflict (key) do nothing;
```

- [ ] **Step 2: Apply it in Supabase**

In the Supabase dashboard → SQL Editor, run the contents of `supabase/migrations/0002_performers.sql`.
Expected: three tables exist; `measurement_definitions` has 10 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_performers.sql
git commit -m "feat: add performers and measurement schema"
```

---

## Task 2: Shared errorResponse + NotFoundError

Extract the M1 inline `errorResponse` into a shared module (a second route now needs it), add `NotFoundError`, and refactor the existing route to use it.

**Files:**
- Modify: `src/lib/errors.ts`
- Create: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`
- Modify: `src/app/api/productions/route.ts`

- [ ] **Step 1: Add NotFoundError**

In `src/lib/errors.ts`, after the `ValidationError` class, add:
```ts
// Thrown when a resource doesn't exist or isn't visible to the caller; maps to HTTP 404.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
```

- [ ] **Step 2: Write the failing test for errorResponse**

Create `src/lib/api.test.ts`:
```ts
import { expect, test } from "vitest";
import { errorResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth-context";
import { ValidationError, NotFoundError } from "@/lib/errors";

async function body(res: Response) {
  return (await res.json()) as { error: string };
}

test("AuthError maps to its own status", async () => {
  const res = errorResponse(new AuthError(403, "No active organization"));
  expect(res.status).toBe(403);
  expect((await body(res)).error).toBe("No active organization");
});

test("ValidationError maps to 400", async () => {
  expect(errorResponse(new ValidationError("Title is required")).status).toBe(400);
});

test("NotFoundError maps to 404", async () => {
  expect(errorResponse(new NotFoundError("Production not found")).status).toBe(404);
});

test("SyntaxError (bad JSON) maps to 400", async () => {
  expect(errorResponse(new SyntaxError("Unexpected token")).status).toBe(400);
});

test("unknown error maps to 500", async () => {
  expect(errorResponse(new Error("boom")).status).toBe(500);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL with "Cannot find module '@/lib/api'".

- [ ] **Step 4: Implement the shared errorResponse**

Create `src/lib/api.ts`:
```ts
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth-context";
import { ValidationError, NotFoundError } from "@/lib/errors";

// Maps known error types to HTTP responses; everything else is a 500.
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Refactor the productions route to use it**

Replace the contents of `src/app/api/productions/route.ts` with:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listProductions, createProduction } from "@/lib/data/productions";
import { ensureOrganization } from "@/lib/data/organizations";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const productions = await listProductions(orgId);
    return NextResponse.json({ productions });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as {
      title?: string;
      showDate?: string | null;
      notes?: string | null;
      orgName?: string;
    };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const production = await createProduction({
      orgId,
      createdBy: userId,
      title: typeof body.title === "string" ? body.title : "",
      showDate: body.showDate ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ production }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 7: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS (existing route tests still green — they assert status codes, which are unchanged).

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (must exit 0), then:
```bash
git add src/lib/errors.ts src/lib/api.ts src/lib/api.test.ts src/app/api/productions/route.ts
git commit -m "refactor: extract shared errorResponse and add NotFoundError"
```

---

## Task 3: measurement-definitions data layer (TDD)

**Files:**
- Create: `src/lib/data/measurement-definitions.ts`
- Test: `src/lib/data/measurement-definitions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/measurement-definitions.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const select = vi.fn(() => ({ order }));
const from = vi.fn((_table: string) => ({ select }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";

beforeEach(() => {
  [order, select, from].forEach((m) => m.mockReset());
  select.mockReturnValue({ order });
  from.mockReturnValue({ select });
});

test("lists definitions ordered by display_order", async () => {
  order.mockResolvedValue({ data: [{ key: "height", label: "Height" }], error: null });
  const rows = await listMeasurementDefinitions();
  expect(from).toHaveBeenCalledWith("measurement_definitions");
  expect(order).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(rows).toEqual([{ key: "height", label: "Height" }]);
});

test("throws on supabase error", async () => {
  order.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listMeasurementDefinitions()).rejects.toThrow("boom");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/measurement-definitions.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/data/measurement-definitions.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface MeasurementDefinition {
  key: string;
  label: string;
  unit: string;
  input_type: string;
  help_text: string | null;
  display_order: number;
}

export async function listMeasurementDefinitions(): Promise<MeasurementDefinition[]> {
  const { data, error } = await supabaseAdmin
    .from("measurement_definitions")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MeasurementDefinition[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/measurement-definitions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/measurement-definitions.ts src/lib/data/measurement-definitions.test.ts
git commit -m "feat: add measurement-definitions data layer"
```

---

## Task 4: Production access helper + getProduction (TDD)

**Files:**
- Modify: `src/lib/data/productions.ts`
- Create: `src/lib/data/production-access.ts`
- Test: `src/lib/data/production-access.test.ts`

- [ ] **Step 1: Add getProduction to the productions data layer**

In `src/lib/data/productions.ts`, after `listProductions`, add:
```ts
export async function getProduction(
  orgId: string,
  productionId: string,
): Promise<Production | null> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Production) ?? null;
}
```

- [ ] **Step 2: Write the failing test for assertProductionInOrg**

Create `src/lib/data/production-access.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const getProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  getProduction: (...a: unknown[]) => getProduction(...a),
}));

import { assertProductionInOrg } from "@/lib/data/production-access";

beforeEach(() => getProduction.mockReset());

test("returns the production when it belongs to the org", async () => {
  getProduction.mockResolvedValue({ id: "p1", org_id: "org_1", title: "Mary Poppins" });
  const prod = await assertProductionInOrg("org_1", "p1");
  expect(getProduction).toHaveBeenCalledWith("org_1", "p1");
  expect(prod).toEqual({ id: "p1", org_id: "org_1", title: "Mary Poppins" });
});

test("throws NotFoundError when the production is missing or in another org", async () => {
  getProduction.mockResolvedValue(null);
  await expect(assertProductionInOrg("org_1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/data/production-access.test.ts`
Expected: FAIL with "Cannot find module '@/lib/data/production-access'".

- [ ] **Step 4: Implement**

Create `src/lib/data/production-access.ts`:
```ts
import { getProduction, type Production } from "@/lib/data/productions";
import { NotFoundError } from "@/lib/errors";

// Confirms a production exists within the caller's org, or throws (404).
export async function assertProductionInOrg(
  orgId: string,
  productionId: string,
): Promise<Production> {
  const production = await getProduction(orgId, productionId);
  if (!production) throw new NotFoundError("Production not found");
  return production;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/data/production-access.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/production-access.ts src/lib/data/production-access.test.ts
git commit -m "feat: add org-scoped production access helper"
```

---

## Task 5: performers data layer (TDD)

**Files:**
- Create: `src/lib/data/performers.ts`
- Test: `src/lib/data/performers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/performers.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

// Chained query-builder mock. Each leaf is reset and re-wired per test.
const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));
const measEq = vi.fn(() => ({ order }));
const upsertSingle = vi.fn();
const upsertSelect = vi.fn(() => ({ single: upsertSingle }));
const upsert = vi.fn(() => ({ select: upsertSelect }));

const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del, upsert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import {
  listPerformers,
  createPerformer,
  deletePerformer,
  getMeasurements,
  upsertMeasurement,
} from "@/lib/data/performers";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, deleteEq, del, measEq,
    upsertSingle, upsertSelect, upsert, select, from].forEach((m) => m.mockReset());
  listEq.mockReturnValue({ order });
  measEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  del.mockReturnValue({ eq: deleteEq });
  upsertSelect.mockReturnValue({ single: upsertSingle });
  upsert.mockReturnValue({ select: upsertSelect });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del, upsert });
});

test("listPerformers filters by production, ordered by created_at", async () => {
  order.mockResolvedValue({ data: [{ id: "pf1", label: "Bert" }], error: null });
  const rows = await listPerformers("p1");
  expect(from).toHaveBeenCalledWith("performers");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "pf1", label: "Bert" }]);
});

test("createPerformer inserts a trimmed label", async () => {
  insertSingle.mockResolvedValue({ data: { id: "pf2", label: "Mary" }, error: null });
  const row = await createPerformer({ productionId: "p1", label: "  Mary  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", label: "Mary" });
  expect(row).toEqual({ id: "pf2", label: "Mary" });
});

test("createPerformer rejects an empty label", async () => {
  await expect(createPerformer({ productionId: "p1", label: "   " })).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("deletePerformer deletes by id", async () => {
  deleteEq.mockResolvedValue({ error: null });
  await deletePerformer("pf1");
  expect(del).toHaveBeenCalled();
  expect(deleteEq).toHaveBeenCalledWith("id", "pf1");
});

test("getMeasurements filters by performer", async () => {
  order.mockResolvedValue({ data: [{ measurement_key: "waist", value_numeric: 28 }], error: null });
  const rows = await getMeasurements("pf1");
  expect(from).toHaveBeenCalledWith("performer_measurements");
  expect(listEq).toHaveBeenCalledWith("performer_id", "pf1");
  expect(rows).toEqual([{ measurement_key: "waist", value_numeric: 28 }]);
});

test("upsertMeasurement upserts on (performer_id, measurement_key)", async () => {
  upsertSingle.mockResolvedValue({
    data: { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, unit: "in" },
    error: null,
  });
  const row = await upsertMeasurement({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    unit: "in",
  });
  expect(upsert).toHaveBeenCalledWith(
    { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, unit: "in" },
    { onConflict: "performer_id,measurement_key" },
  );
  expect(row).toEqual({ performer_id: "pf1", measurement_key: "waist", value_numeric: 28, unit: "in" });
});

test("upsertMeasurement rejects a non-finite value", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "waist", valueNumeric: NaN, unit: "in" }),
  ).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/performers.test.ts`
Expected: FAIL with "Cannot find module '@/lib/data/performers'".

- [ ] **Step 3: Implement**

Create `src/lib/data/performers.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface Performer {
  id: string;
  production_id: string;
  label: string;
  notes: string | null;
  created_at: string;
}

export interface PerformerMeasurement {
  id: string;
  performer_id: string;
  measurement_key: string;
  value_numeric: number;
  unit: string;
  updated_at: string;
}

export async function listPerformers(productionId: string): Promise<Performer[]> {
  const { data, error } = await supabaseAdmin
    .from("performers")
    .select("*")
    .eq("production_id", productionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Performer[];
}

export async function createPerformer(input: {
  productionId: string;
  label: string;
}): Promise<Performer> {
  const label = input.label.trim();
  if (!label) throw new ValidationError("Performer name is required");
  const { data, error } = await supabaseAdmin
    .from("performers")
    .insert({ production_id: input.productionId, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Performer;
}

export async function deletePerformer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("performers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getMeasurements(performerId: string): Promise<PerformerMeasurement[]> {
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .select("*")
    .eq("performer_id", performerId)
    .order("measurement_key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PerformerMeasurement[];
}

export async function upsertMeasurement(input: {
  performerId: string;
  measurementKey: string;
  valueNumeric: number;
  unit: string;
}): Promise<PerformerMeasurement> {
  if (!Number.isFinite(input.valueNumeric)) {
    throw new ValidationError("Measurement must be a number");
  }
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .upsert(
      {
        performer_id: input.performerId,
        measurement_key: input.measurementKey,
        value_numeric: input.valueNumeric,
        unit: input.unit,
      },
      { onConflict: "performer_id,measurement_key" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PerformerMeasurement;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/performers.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/performers.ts src/lib/data/performers.test.ts
git commit -m "feat: add performers and measurements data layer"
```

---

## Task 6: Performers API route — GET list / POST create (TDD)

**Files:**
- Create: `src/app/api/productions/[id]/performers/route.ts`
- Test: `src/app/api/productions/[id]/performers/route.test.ts`

> **Next 16 note:** dynamic route params are async — handlers receive `{ params: Promise<{ id: string }> }` and must `await params`. Verify against `node_modules/next/dist/docs/` if the type complains.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/performers/route.test.ts`:
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

const listPerformers = vi.fn();
const createPerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  listPerformers: (...a: unknown[]) => listPerformers(...a),
  createPerformer: (...a: unknown[]) => createPerformer(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/performers/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listPerformers, createPerformer].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function postReq(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});

test("GET lists performers for an in-org production", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listPerformers.mockResolvedValue([{ id: "pf1", label: "Bert" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ performers: [{ id: "pf1", label: "Bert" }] });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(listPerformers).toHaveBeenCalledWith("p1");
});

test("POST creates a performer (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createPerformer.mockResolvedValue({ id: "pf2", label: "Mary" });
  const res = await POST(postReq({ label: "Mary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Mary" });
});

test("POST 400 on empty label", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createPerformer.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ label: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/performers/route.test.ts"`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/app/api/productions/[id]/performers/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listPerformers, createPerformer } from "@/lib/data/performers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const performers = await listPerformers(id);
    return NextResponse.json({ performers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { label?: string };
    const performer = await createPerformer({
      productionId: id,
      label: typeof body.label === "string" ? body.label : "",
    });
    return NextResponse.json({ performer }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/performers/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (must exit 0), then:
```bash
git add "src/app/api/productions/[id]/performers/route.ts" "src/app/api/productions/[id]/performers/route.test.ts"
git commit -m "feat: add performers list/create API route"
```

---

## Task 7: Performer delete + measurements API (TDD)

**Files:**
- Create: `src/app/api/performers/[performerId]/route.ts`
- Create: `src/app/api/performers/[performerId]/measurements/route.ts`
- Test: `src/app/api/performers/[performerId]/measurements/route.test.ts`

> **Org-scoping note:** these routes key off a `performerId`, not a production. For this slice we authenticate (signed-in + active org) and operate on the performer directly; full performer→production→org ownership checks are a hardening follow-up tracked below. Listed explicitly so it isn't mistaken for complete tenant isolation.

- [ ] **Step 1: Write the failing test (measurements route)**

Create `src/app/api/performers/[performerId]/measurements/route.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const getMeasurements = vi.fn();
const upsertMeasurement = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  getMeasurements: (...a: unknown[]) => getMeasurements(...a),
  upsertMeasurement: (...a: unknown[]) => upsertMeasurement(...a),
}));

import { GET, PUT } from "@/app/api/performers/[performerId]/measurements/route";

beforeEach(() => {
  [getAuthContext, getMeasurements, upsertMeasurement].forEach((m) => m.mockReset());
});

const ctx = (performerId: string) => ({ params: Promise.resolve({ performerId }) });

function putReq(body: unknown) {
  return new Request("http://test", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await GET(new Request("http://test"), ctx("pf1"));
  expect(res.status).toBe(401);
});

test("GET returns measurements", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  getMeasurements.mockResolvedValue([{ measurement_key: "waist", value_numeric: 28 }]);
  const res = await GET(new Request("http://test"), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ measurements: [{ measurement_key: "waist", value_numeric: 28 }] });
  expect(getMeasurements).toHaveBeenCalledWith("pf1");
});

test("PUT upserts one measurement", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockResolvedValue({ measurement_key: "waist", value_numeric: 28, unit: "in" });
  const res = await PUT(putReq({ measurementKey: "waist", valueNumeric: 28, unit: "in" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(upsertMeasurement).toHaveBeenCalledWith({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    unit: "in",
  });
});

test("PUT 400 on a non-numeric value", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockRejectedValue(new ValidationError("Measurement must be a number"));
  const res = await PUT(putReq({ measurementKey: "waist", valueNumeric: "x", unit: "in" }), ctx("pf1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/performers/[performerId]/measurements/route.test.ts"`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the measurements route**

Create `src/app/api/performers/[performerId]/measurements/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getMeasurements, upsertMeasurement } from "@/lib/data/performers";

type Ctx = { params: Promise<{ performerId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    await getAuthContext();
    const { performerId } = await params;
    const measurements = await getMeasurements(performerId);
    return NextResponse.json({ measurements });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    await getAuthContext();
    const { performerId } = await params;
    const body = (await request.json()) as {
      measurementKey?: string;
      valueNumeric?: unknown;
      unit?: string;
    };
    const measurement = await upsertMeasurement({
      performerId,
      measurementKey: String(body.measurementKey ?? ""),
      valueNumeric: Number(body.valueNumeric),
      unit: String(body.unit ?? "in"),
    });
    return NextResponse.json({ measurement });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Implement the performer delete route**

Create `src/app/api/performers/[performerId]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { deletePerformer } from "@/lib/data/performers";

type Ctx = { params: Promise<{ performerId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await getAuthContext();
    const { performerId } = await params;
    await deletePerformer(performerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/performers/[performerId]/measurements/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` (must exit 0), then:
```bash
git add "src/app/api/performers"
git commit -m "feat: add performer delete and measurements API routes"
```

---

## Task 8: Link production cards to a detail page + detail shell

**Files:**
- Modify: `src/app/productions/page.tsx`
- Create: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Make each production card a link**

In `src/app/productions/page.tsx`, change the card `<li>` so its contents link to the detail page. Replace the `<li>` block with:
```tsx
            <li key={p.id} className="rounded-lg border hover:bg-gray-50">
              <Link href={`/productions/${p.id}`} className="block p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg font-semibold">{p.title}</span>
                  <div className="flex items-center gap-2">
                    {p.show_date && (
                      <span className="text-sm text-gray-600">{formatShowDate(p.show_date)}</span>
                    )}
                    <CountdownBadge showDate={p.show_date} />
                  </div>
                </div>
              </Link>
            </li>
```

- [ ] **Step 2: Build the production detail page (server component)**

Create `src/app/productions/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listPerformers } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { PerformerList } from "@/components/PerformerList";

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

  const performers = await listPerformers(id);

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
        <h2 className="mb-3 text-lg font-semibold">Cast</h2>
        <PerformerList productionId={id} initialPerformers={performers} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0. (`PerformerList` is created in Task 9; if you run before Task 9, expect an unresolved-import error — implement Task 9 then re-check. If executing in order, do Step 4 after Task 9.)

- [ ] **Step 4: Commit (after Task 9 so the import resolves)**

```bash
git add src/app/productions/page.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: link production cards to a detail page with cast section"
```

---

## Task 9: PerformerList client component (add/remove)

**Files:**
- Create: `src/components/PerformerList.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/PerformerList.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Performer {
  id: string;
  label: string;
}

export function PerformerList({
  productionId,
  initialPerformers,
}: {
  productionId: string;
  initialPerformers: Performer[];
}) {
  const router = useRouter();
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPerformer(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/performers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const { performer } = (await res.json()) as { performer: Performer };
      setPerformers((prev) => [...prev, performer]);
      setLabel("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't add performer");
    }
    setBusy(false);
  }

  async function removePerformer(id: string) {
    setBusy(true);
    const res = await fetch(`/api/performers/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setPerformers((prev) => prev.filter((p) => p.id !== id));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {performers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
          No cast members yet. Add your first performer below.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {performers.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <Link
                href={`/productions/${productionId}/performers/${p.id}`}
                className="font-medium hover:underline"
              >
                {p.label}
              </Link>
              <button
                onClick={() => removePerformer(p.id)}
                disabled={busy}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addPerformer} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Performer name or role"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={() => router.refresh()} className="text-sm text-gray-400 hover:underline">
        Refresh
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (all green).

- [ ] **Step 3: Commit (with Task 8's page changes)**

```bash
git add src/components/PerformerList.tsx src/app/productions/page.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: link production cards to a detail page with cast section"
```

- [ ] **Step 4: Manual verify (needs Clerk + Supabase keys + a browser)**

Run `npm run dev`, sign in, open a production. Expected: the detail page shows the title, date, countdown, and an empty Cast section. Add a performer → it appears in the list. Remove → it disappears. Click a performer's name → navigates to the measurement page (404/empty until Task 10).

---

## Task 10: Measurement entry page + autosave

**Files:**
- Create: `src/app/productions/[id]/performers/[performerId]/page.tsx`
- Create: `src/components/MeasurementForm.tsx`

- [ ] **Step 1: Build the measurement page (server shell)**

Create `src/app/productions/[id]/performers/[performerId]/page.tsx`:
```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements } from "@/lib/data/performers";
import { MeasurementForm } from "@/components/MeasurementForm";

export default async function MeasurementPage({
  params,
}: {
  params: Promise<{ id: string; performerId: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await params;
  await assertProductionInOrg(orgId, id);

  const [definitions, measurements] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurements(performerId),
  ]);

  const initial: Record<string, number> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_numeric;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href={`/productions/${id}`} className="text-sm text-gray-500 hover:underline">
        ← Cast
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Measurements</h1>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
    </main>
  );
}
```

- [ ] **Step 2: Build the autosave form (client)**

Create `src/components/MeasurementForm.tsx`:
```tsx
"use client";

import { useState } from "react";

interface Definition {
  key: string;
  label: string;
  unit: string;
  help_text: string | null;
}

export function MeasurementForm({
  performerId,
  definitions,
  initialValues,
}: {
  performerId: string;
  definitions: Definition[];
  initialValues: Record<string, number>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const d of definitions) {
      v[d.key] = d.key in initialValues ? String(initialValues[d.key]) : "";
    }
    return v;
  });
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | "error">>({});

  async function save(def: Definition, raw: string) {
    if (raw.trim() === "") return; // nothing to save for an empty field
    const valueNumeric = Number(raw);
    setSaved((s) => ({ ...s, [def.key]: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ measurementKey: def.key, valueNumeric, unit: def.unit }),
    });
    setSaved((s) => ({ ...s, [def.key]: res.ok ? "saved" : "error" }));
  }

  const filledCount = definitions.filter((d) => values[d.key]?.trim() !== "").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {filledCount} of {definitions.length} measured
      </p>
      {definitions.map((def) => (
        <label key={def.key} className="block">
          <span className="mb-1 block font-medium">
            {def.label} <span className="text-gray-400">({def.unit})</span>
          </span>
          {def.help_text && <span className="mb-1 block text-xs text-gray-500">{def.help_text}</span>}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              className="w-full rounded-lg border p-3"
              value={values[def.key]}
              onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
              onBlur={(e) => save(def, e.target.value)}
            />
            <span className="w-14 text-sm text-gray-500">
              {saved[def.key] === "saving" && "Saving…"}
              {saved[def.key] === "saved" && "Saved"}
              {saved[def.key] === "error" && <span className="text-red-600">Error</span>}
            </span>
          </div>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json` (exit 0) and `npm test` (all green).

- [ ] **Step 4: Commit**

```bash
git add "src/app/productions/[id]/performers" src/components/MeasurementForm.tsx
git commit -m "feat: add per-performer measurement entry with autosave"
```

- [ ] **Step 5: Manual verify (needs keys + browser)**

Run `npm run dev`, open a production → a performer. Expected: the measurement fields render (Height, Weight, Chest…), each labeled with its unit and help text, with a "X of 10 measured" counter. Type a value, blur the field → "Saved" appears. Reload the page → the value persists (proves the Supabase upsert + read).

---

## Milestone 2 · Slice 1 complete

Clicking a production now opens its workspace; you can manage the cast and record each performer's measurements, all org-scoped, with the measurement data persisted and ready for the fabric engine.

**Next slice (separate plan):** garment templates + the deterministic fabric calc engine (spec §5) — turning these measurements into "how much fabric," built test-first. Then roles/casts/castings (the cast grid) and per-role costume designs.

---

## Deferred / follow-ups (carried forward)

- **Performer→production→org ownership check** on `/api/performers/[performerId]/*` (Task 7) — currently auth-gated only. Add a `assertPerformerInOrg` once the cast grid lands.
- **in/cm toggle** for measurements (spec §7) — values are stored in each definition's unit for now.
- Plus the M1 carry-overs (org name from Clerk, `updated_at` trigger, per-production roles, `assertWithinPlanLimits`) from the foundation plan.

---

## Self-review notes

- **Spec coverage (this slice):** §4 `measurement_definitions`/`performers`/`performer_measurements` (Task 1, 3, 5); §6 org-scoped access (Task 4) + auth on every route (Tasks 6–7); §7 production detail + Cast + per-performer Measurements with progress + autosave (Tasks 8–10). Roles/casts/designs/engine/templates deferred to later slices by design (spec §9).
- **Placeholders:** none — every code/test step is complete.
- **Type consistency:** `Performer`, `PerformerMeasurement`, `MeasurementDefinition`, `getProduction`/`assertProductionInOrg`, `listPerformers`/`createPerformer`/`deletePerformer`/`getMeasurements`/`upsertMeasurement`, `errorResponse`, `NotFoundError`, and the `{ performers } / { performer } / { measurements } / { measurement }` API shapes are used consistently across data layer, routes, tests, and components. Dynamic route params are typed as `Promise<…>` and awaited (Next 16).
