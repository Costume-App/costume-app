# Phase 1 — Multiple Show Dates + Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give productions many show dates (add/remove), let users edit the name, and switch all date displays to the next-upcoming date.

**Architecture:** New `show_dates` one-to-many table (existing single `show_date` migrated in, then dropped). Pure date helpers in `countdown.ts`, a `show-dates` data module, sub-resource API routes mirroring `casts`, and an `EditableProductionHeader` client component. The list/detail pages compute "next upcoming" from each production's date set.

**Tech Stack:** Next.js 16 (async params), TypeScript strict, Supabase (`supabaseAdmin`), Clerk (`getAuthContext`), Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-multiple-show-dates-design.md`

**Conventions to follow:** data fns throw `ValidationError`/`NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data call → JSON, wrapped in try/catch with `errorResponse`. Vitest mocks chain via `vi.fn()` returning the next step (see existing `*.test.ts`).

---

## Task 1: Migration `0006_show_dates.sql`

**Files:**
- Create: `supabase/migrations/0006_show_dates.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Multiple show dates per production (replaces the single productions.show_date).
create table if not exists show_dates (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  show_date     date not null,
  created_at    timestamptz not null default now()
);
create index if not exists show_dates_production_id_idx on show_dates(production_id);

-- Preserve existing dates.
insert into show_dates (production_id, show_date)
select id, show_date from productions where show_date is not null;

-- One source of truth.
alter table productions drop column show_date;
```

- [ ] **Step 2: Commit (do NOT apply yet — Chris runs it in Supabase)**

```bash
git add supabase/migrations/0006_show_dates.sql
git commit -m "feat: 0006 show_dates table migration (multi-date)"
```

> **MANUAL STEP (Chris):** apply this in the Supabase SQL editor before the app is exercised against the DB. The implementer cannot run it. Tests use mocks and do not need the DB.

---

## Task 2: Date helpers in `countdown.ts`

**Files:**
- Test: `src/lib/countdown.test.ts` (create — confirm it doesn't already exist; if it does, append the tests)
- Modify: `src/lib/countdown.ts` (append two functions)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/countdown.test.ts`:

```typescript
import { expect, test } from "vitest";
import { nextUpcomingDate, latestDate } from "@/lib/countdown";

test("nextUpcomingDate returns the soonest date on or after today", () => {
  expect(nextUpcomingDate(["2026-07-01", "2026-06-10", "2026-06-20"], "2026-06-15")).toBe("2026-06-20");
});

test("nextUpcomingDate treats today as upcoming", () => {
  expect(nextUpcomingDate(["2026-06-15", "2026-08-01"], "2026-06-15")).toBe("2026-06-15");
});

test("nextUpcomingDate returns null when all dates are past", () => {
  expect(nextUpcomingDate(["2026-01-01", "2026-02-01"], "2026-06-15")).toBeNull();
});

test("nextUpcomingDate returns null for an empty list", () => {
  expect(nextUpcomingDate([], "2026-06-15")).toBeNull();
});

test("latestDate returns the maximum date", () => {
  expect(latestDate(["2026-07-01", "2026-06-10", "2026-08-20"])).toBe("2026-08-20");
});

test("latestDate returns null for an empty list", () => {
  expect(latestDate([])).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- countdown`
Expected: FAIL — no exports `nextUpcomingDate`/`latestDate`.

- [ ] **Step 3: Append the implementation**

Append to `src/lib/countdown.ts`:

```typescript
// Soonest date on or after `today`, or null if none upcoming. Dates are YYYY-MM-DD,
// so lexical comparison/sort is correct.
export function nextUpcomingDate(dates: string[], today: string): string | null {
  const upcoming = dates.filter((d) => d >= today).sort();
  return upcoming[0] ?? null;
}

// Latest date, or null if the list is empty.
export function latestDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort()[dates.length - 1];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- countdown`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/lib/countdown.test.ts
git commit -m "feat: nextUpcomingDate + latestDate helpers"
```

---

## Task 3: `show-dates` data layer

**Files:**
- Test: `src/lib/data/show-dates.test.ts` (create)
- Create: `src/lib/data/show-dates.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/show-dates.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order = vi.fn();
const inFn = vi.fn(() => ({ order }));
const selectList = vi.fn(() => ({ in: inFn }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delEq2 = vi.fn();
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select: selectList, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listShowDates, addShowDate, deleteShowDate } from "@/lib/data/show-dates";

beforeEach(() => {
  [order, inFn, selectList, single, insertSelect, insert, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  inFn.mockReturnValue({ order });
  selectList.mockReturnValue({ in: inFn });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select: selectList, insert, delete: del });
});

test("listShowDates returns [] without querying for an empty id list", async () => {
  expect(await listShowDates([])).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test("listShowDates queries show_dates by production_id, ordered by date", async () => {
  order.mockResolvedValue({ data: [{ id: "s1", production_id: "p1", show_date: "2026-07-01" }], error: null });
  const rows = await listShowDates(["p1", "p2"]);
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(inFn).toHaveBeenCalledWith("production_id", ["p1", "p2"]);
  expect(order).toHaveBeenCalledWith("show_date", { ascending: true });
  expect(rows).toEqual([{ id: "s1", production_id: "p1", show_date: "2026-07-01" }]);
});

test("addShowDate inserts and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "s2", production_id: "p1", show_date: "2026-08-01" }, error: null });
  const row = await addShowDate("p1", "2026-08-01");
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-01" });
  expect(row).toEqual({ id: "s2", production_id: "p1", show_date: "2026-08-01" });
});

test("addShowDate rejects an empty date with ValidationError", async () => {
  await expect(addShowDate("p1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("deleteShowDate deletes scoped by id and production_id", async () => {
  delEq2.mockResolvedValue({ error: null });
  await deleteShowDate("p1", "s1");
  expect(delEq1).toHaveBeenCalledWith("id", "s1");
  expect(delEq2).toHaveBeenCalledWith("production_id", "p1");
});

test("deleteShowDate throws on supabase error", async () => {
  delEq2.mockResolvedValue({ error: { message: "boom" } });
  await expect(deleteShowDate("p1", "s1")).rejects.toThrow("boom");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- show-dates`
Expected: FAIL — module `@/lib/data/show-dates` not found.

- [ ] **Step 3: Create the implementation**

Create `src/lib/data/show-dates.ts`:

```typescript
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface ShowDate {
  id: string;
  production_id: string;
  show_date: string;
  created_at: string;
}

export async function listShowDates(productionIds: string[]): Promise<ShowDate[]> {
  if (productionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .select("*")
    .in("production_id", productionIds)
    .order("show_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShowDate[];
}

export async function addShowDate(productionId: string, date: string): Promise<ShowDate> {
  const show_date = date.trim();
  if (!show_date) throw new ValidationError("Show date is required");
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .insert({ production_id: productionId, show_date })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShowDate;
}

export async function deleteShowDate(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("show_dates")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- show-dates`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/show-dates.ts src/lib/data/show-dates.test.ts
git commit -m "feat: show-dates data layer (list/add/delete)"
```

---

## Task 4: `productions.ts` — drop `show_date`, add `updateProduction`

**Files:**
- Modify: `src/lib/data/productions.ts`
- Modify: `src/lib/data/productions.test.ts` (update `createProduction` tests)
- Test: `src/lib/data/productions-update.test.ts` (create — for `updateProduction`, separate file like `productions-delete.test.ts`)

- [ ] **Step 1: Update `productions.ts` — remove `show_date`, add `updateProduction`**

In `src/lib/data/productions.ts`:

1. Change the import line `import { ValidationError } from "@/lib/errors";` to:

```typescript
import { ValidationError, NotFoundError } from "@/lib/errors";
```

2. In `interface Production`, delete the line:

```typescript
  show_date: string | null;
```

3. In `interface CreateProductionInput`, delete the line:

```typescript
  showDate: string | null;
```

4. In `createProduction`, remove `show_date: input.showDate,` from the `.insert({...})` object.

5. Append `updateProduction` after `createProduction`:

```typescript
export async function updateProduction(orgId: string, id: string, title: string): Promise<Production> {
  const trimmed = title.trim();
  if (!trimmed) throw new ValidationError("Title is required");
  const { data, error } = await supabaseAdmin
    .from("productions")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Production not found");
  return data as Production;
}
```

- [ ] **Step 2: Update `createProduction` tests in `productions.test.ts`**

In `src/lib/data/productions.test.ts`:

- In the test "createProduction inserts the row and returns it", change the `createProduction({...})` call to drop `showDate` and change the `expect(insert).toHaveBeenCalledWith({...})` to drop `show_date`. Result:

```typescript
test("createProduction inserts the row and returns it", async () => {
  single.mockResolvedValue({ data: { id: "p2", title: "Newsies" }, error: null });
  const row = await createProduction({
    orgId: "org_1",
    createdBy: "user_1",
    title: "Newsies",
    notes: null,
  });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1",
    created_by: "user_1",
    title: "Newsies",
    notes: null,
  });
  expect(row).toEqual({ id: "p2", title: "Newsies" });
});
```

- In "createProduction rejects an empty title with a ValidationError", change the call to:

```typescript
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "  ", notes: null }),
```

- In "createProduction throws on supabase error", change the call to:

```typescript
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "Cats", notes: null }),
```

- [ ] **Step 3: Create `productions-update.test.ts`**

Create `src/lib/data/productions-update.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updateProduction } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updateProduction updates the title scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", title: "Annie" }, error: null });
  const row = await updateProduction("org_1", "p1", "  Annie  ");
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ title: "Annie" });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", title: "Annie" });
});

test("updateProduction rejects an empty title with ValidationError", async () => {
  await expect(updateProduction("org_1", "p1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("updateProduction throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateProduction("org_1", "nope", "X")).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 4: Run the data tests**

Run: `npm test -- productions`
Expected: PASS (productions.test.ts + productions-update.test.ts + productions-delete.test.ts all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/productions.test.ts src/lib/data/productions-update.test.ts
git commit -m "feat: drop show_date from productions, add updateProduction"
```

---

## Task 5: show-dates API routes

**Files:**
- Create: `src/app/api/productions/[id]/show-dates/route.ts` (POST)
- Create: `src/app/api/productions/[id]/show-dates/[dateId]/route.ts` (DELETE)
- Test: `src/app/api/productions/[id]/show-dates/route.test.ts`
- Test: `src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts`

- [ ] **Step 1: Create the POST collection route**

Create `src/app/api/productions/[id]/show-dates/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { addShowDate } from "@/lib/data/show-dates";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { date?: string };
    const showDate = await addShowDate(id, typeof body.date === "string" ? body.date : "");
    return NextResponse.json({ showDate }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Create the DELETE item route**

Create `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteShowDate } from "@/lib/data/show-dates";

type Ctx = { params: Promise<{ id: string; dateId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, dateId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteShowDate(id, dateId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 3: Write the route tests**

Create `src/app/api/productions/[id]/show-dates/route.test.ts`:

```typescript
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

const addShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  addShowDate: (...a: unknown[]) => addShowDate(...a),
}));

import { POST } from "@/app/api/productions/[id]/show-dates/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, addShowDate].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST adds a show date (201)", async () => {
  addShowDate.mockResolvedValue({ id: "s1", production_id: "p1", show_date: "2026-08-01" });
  const res = await POST(req({ date: "2026-08-01" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ showDate: { id: "s1", production_id: "p1", show_date: "2026-08-01" } });
  expect(addShowDate).toHaveBeenCalledWith("p1", "2026-08-01");
});

test("POST 400 on an empty date", async () => {
  const { ValidationError } = await import("@/lib/errors");
  addShowDate.mockRejectedValue(new ValidationError("Show date is required"));
  const res = await POST(req({ date: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ date: "2026-08-01" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addShowDate).not.toHaveBeenCalled();
});
```

Create `src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts`:

```typescript
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

const deleteShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  deleteShowDate: (...a: unknown[]) => deleteShowDate(...a),
}));

import { DELETE } from "@/app/api/productions/[id]/show-dates/[dateId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteShowDate].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, dateId: string) => ({ params: Promise.resolve({ id, dateId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes a show date (200)", async () => {
  deleteShowDate.mockResolvedValue(undefined);
  const res = await DELETE(req(), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(deleteShowDate).toHaveBeenCalledWith("p1", "s1");
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx("p1", "s1"));
  expect(res.status).toBe(404);
  expect(deleteShowDate).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run the route tests + tsc**

Run: `npm test -- show-dates` then `npx tsc --noEmit`
Expected: all show-dates tests pass (data + both routes); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/show-dates"
git commit -m "feat: show-dates API routes (POST add, DELETE remove)"
```

---

## Task 6: `PATCH /api/productions/[id]` — edit title

**Files:**
- Modify: `src/app/api/productions/[id]/route.ts` (add PATCH handler + import)
- Modify: `src/app/api/productions/[id]/route.test.ts` (add PATCH tests + mock)

- [ ] **Step 1: Add the PATCH handler**

In `src/app/api/productions/[id]/route.ts`:

1. Change the import `import { deleteProduction } from "@/lib/data/productions";` to:

```typescript
import { deleteProduction, updateProduction } from "@/lib/data/productions";
```

2. Add this handler (after the existing `DELETE` handler):

```typescript
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { title?: string };
    const production = await updateProduction(orgId, id, typeof body.title === "string" ? body.title : "");
    return NextResponse.json({ production });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Add PATCH tests to the existing route test**

In `src/app/api/productions/[id]/route.test.ts`:

1. Change the `productions` mock block to also expose `updateProduction`:

```typescript
const deleteProduction = vi.fn();
const updateProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
  updateProduction: (...a: unknown[]) => updateProduction(...a),
}));
```

2. Change the import to include `PATCH`:

```typescript
import { DELETE, PATCH } from "@/app/api/productions/[id]/route";
```

3. Add `updateProduction` to the `beforeEach` reset array:

```typescript
  [getAuthContext, assertProductionInOrg, deleteProduction, updateProduction].forEach((m) => m.mockReset());
```

4. Append these tests:

```typescript
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH updates the title (200)", async () => {
  updateProduction.mockResolvedValue({ id: "p1", title: "Annie" });
  const res = await PATCH(patchReq({ title: "Annie" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: "p1", title: "Annie" } });
  expect(updateProduction).toHaveBeenCalledWith("org_1", "p1", "Annie");
});

test("PATCH 404 when the production is not in the caller's org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ title: "X" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(updateProduction).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the route test + tsc**

Run: `npm test -- "productions/\[id\]/route"` (or `npm test -- route`) then `npx tsc --noEmit`
Expected: PATCH + existing DELETE tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/route.ts" "src/app/api/productions/[id]/route.test.ts"
git commit -m "feat: PATCH /api/productions/[id] edits the title"
```

---

## Task 7: `POST /api/productions` — store the first show date

**Files:**
- Modify: `src/app/api/productions/route.ts`
- Modify: `src/app/api/productions/route.test.ts`

- [ ] **Step 1: Update the POST handler**

In `src/app/api/productions/route.ts`:

1. Add an import for `addShowDate`:

```typescript
import { addShowDate } from "@/lib/data/show-dates";
```

2. In `POST`, the `createProduction({...})` call must no longer pass `showDate`. After it returns, add the first date if provided. Replace the body of the `try` from the `createProduction` call through the return with:

```typescript
    const production = await createProduction({
      orgId,
      createdBy: userId,
      title: typeof body.title === "string" ? body.title : "",
      notes: body.notes ?? null,
    });
    if (typeof body.showDate === "string" && body.showDate.trim()) {
      await addShowDate(production.id, body.showDate);
    }
    return NextResponse.json({ production }, { status: 201 });
```

(The `body` type already includes `showDate?: string | null` — leave it.)

- [ ] **Step 2: Update the POST tests**

In `src/app/api/productions/route.test.ts`:

1. Add an `addShowDate` mock after the `productions` mock block:

```typescript
const addShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  addShowDate: (...a: unknown[]) => addShowDate(...a),
}));
```

2. Add `addShowDate` to the `beforeEach` reset array:

```typescript
  [getAuthContext, listProductions, createProduction, ensureOrganization, addShowDate].forEach((m) => m.mockReset());
```

3. Replace the test "POST creates a production and returns 201" with:

```typescript
test("POST creates a production, stores the first show date, returns 201", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(postReq({ title: "Newsies", showDate: "2026-11-01", orgName: "Lincoln HS" }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", "Lincoln HS");
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "Newsies",
    notes: null,
  });
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01");
});

test("POST does not add a show date when none is provided", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p3", title: "Cats" });
  const res = await POST(postReq({ title: "Cats", showDate: null }));
  expect(res.status).toBe(201);
  expect(addShowDate).not.toHaveBeenCalled();
});
```

4. In "POST coerces a non-string title to empty before calling the data layer", change the `expect(createProduction).toHaveBeenCalledWith({...})` to drop `showDate`:

```typescript
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "",
    notes: null,
  });
```

- [ ] **Step 3: Run the test + tsc**

Run: `npm test -- "api/productions/route"` (or `npm test`) then `npx tsc --noEmit`
Expected: all POST tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/route.ts" "src/app/api/productions/route.test.ts"
git commit -m "feat: POST /api/productions stores the first show date"
```

---

## Task 8: Detail page — next-upcoming date + EditableProductionHeader

**Files:**
- Create: `src/components/EditableProductionHeader.tsx`
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Create the client component**

Create `src/components/EditableProductionHeader.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatShowDate } from "@/lib/countdown";

interface ShowDateItem {
  id: string;
  show_date: string;
}

export function EditableProductionHeader({
  productionId,
  title,
  showDates,
}: {
  productionId: string;
  title: string;
  showDates: ShowDateItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, init: RequestInit, failMsg: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { credentials: "include", ...init });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? failMsg);
      setBusy(false);
      return false;
    }
    setBusy(false);
    router.refresh();
    return true;
  }

  function saveName() {
    return send(
      `/api/productions/${productionId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: name }) },
      "Couldn't save name",
    );
  }

  async function addDate() {
    if (!newDate) return;
    const ok = await send(
      `/api/productions/${productionId}/show-dates`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: newDate }) },
      "Couldn't add date",
    );
    if (ok) setNewDate("");
  }

  function removeDate(dateId: string) {
    return send(
      `/api/productions/${productionId}/show-dates/${dateId}`,
      { method: "DELETE" },
      "Couldn't remove date",
    );
  }

  if (!editing) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold leading-none">{title}</h1>
        <button type="button" onClick={() => setEditing(true)} className="link-muted mt-1 text-sm">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="surface w-full max-w-md space-y-3 p-4">
      <label className="block">
        <span className="lbl mb-1 block">Production name</span>
        <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="space-y-2">
        <span className="lbl block">Show dates</span>
        {showDates.length === 0 && <p className="text-sm muted">No dates yet.</p>}
        {showDates.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{formatShowDate(d.show_date)}</span>
            <button type="button" onClick={() => removeDate(d.id)} disabled={busy} className="link-muted text-sm">
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="field flex-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <button type="button" onClick={addDate} disabled={busy || !newDate} className="btn-ghost text-sm">
            Add date
          </button>
        </div>
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setName(title);
          setNewDate("");
          setError(null);
        }}
        disabled={busy}
        className="link-muted text-sm"
      >
        Done
      </button>
    </div>
  );
}
```

Note: name is saved explicitly with the **Save name** action via `onBlur`? No — to keep one obvious action, the name is saved when the user leaves the field. Use `onBlur={() => name.trim() && name !== title && saveName()}` on the name input. Update the name `<input>` to include that handler:

```tsx
        <input
          className="field w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== title && saveName()}
        />
```

- [ ] **Step 2: Wire the detail page**

In `src/app/productions/[id]/page.tsx`:

1. Add imports near the other data imports:

```tsx
import { listShowDates } from "@/lib/data/show-dates";
import { nextUpcomingDate, todayIso } from "@/lib/countdown";
import { EditableProductionHeader } from "@/components/EditableProductionHeader";
```

(Keep the existing `formatShowDate` and `CountdownBadge` imports.)

2. After the production is loaded, fetch its show dates. Add (e.g. alongside the other `await`s):

```tsx
  const showDates = await listShowDates([id]);
  const nextUpcoming = nextUpcomingDate(showDates.map((d) => d.show_date), todayIso());
```

3. Replace the header block:

```tsx
      <div className="mt-2 mb-6 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold leading-none">{production.title}</h1>
        <div className="flex flex-col items-end gap-1">
          {production.show_date && (
            <span className="text-sm muted">{formatShowDate(production.show_date)}</span>
          )}
          <CountdownBadge showDate={production.show_date} />
        </div>
      </div>
```

with:

```tsx
      <div className="mt-2 mb-6 flex items-start justify-between gap-3">
        <EditableProductionHeader
          productionId={id}
          title={production.title}
          showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date }))}
        />
        <div className="flex flex-col items-end gap-1">
          {nextUpcoming && <span className="text-sm muted">{formatShowDate(nextUpcoming)}</span>}
          <CountdownBadge showDate={nextUpcoming} />
        </div>
      </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (expect clean) and `npm run lint` (expect no new errors from the two files).

- [ ] **Step 4: Commit**

```bash
git add src/components/EditableProductionHeader.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: editable name + show dates on production detail page"
```

---

## Task 9: List page — next-upcoming date per card

**Files:**
- Modify: `src/app/productions/page.tsx`

- [ ] **Step 1: Update the list page**

In `src/app/productions/page.tsx`:

1. Add imports:

```tsx
import { listShowDates } from "@/lib/data/show-dates";
import { nextUpcomingDate, todayIso } from "@/lib/countdown";
```

(Keep the existing `formatShowDate` and `CountdownBadge` imports.)

2. After `listProductions(orgId)` resolves, fetch all show dates and build a per-production next-upcoming map. Add after the `const userName = ...` block:

```tsx
  const allShowDates = await listShowDates(productions.map((p) => p.id));
  const today = todayIso();
  const nextByProduction = new Map<string, string | null>();
  for (const p of productions) {
    const dates = allShowDates.filter((d) => d.production_id === p.id).map((d) => d.show_date);
    nextByProduction.set(p.id, nextUpcomingDate(dates, today));
  }
```

3. In the card markup, replace:

```tsx
                    {p.show_date && <span className="text-sm muted">{formatShowDate(p.show_date)}</span>}
                    <CountdownBadge showDate={p.show_date} />
```

with:

```tsx
                    {nextByProduction.get(p.id) && (
                      <span className="text-sm muted">{formatShowDate(nextByProduction.get(p.id)!)}</span>
                    )}
                    <CountdownBadge showDate={nextByProduction.get(p.id) ?? null} />
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (expect clean) and `npm run lint` (expect no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/productions/page.tsx
git commit -m "feat: productions list shows next-upcoming date per card"
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Whole suite**

Run: `npm test`
Expected: all tests pass (new countdown/show-dates/productions-update/route tests included).

- [ ] **Step 2: Types + lint**

Run: `npx tsc --noEmit` (clean) and `npm run lint` (no new errors — pre-existing test-file warnings are OK).

- [ ] **Step 3: Confirm no stale `show_date` references remain on `Production`**

Run: `grep -rn "production.show_date\|p.show_date\|\.show_date" src/app src/components`
Expected: no references to a `show_date` property on a production object (only `d.show_date` on ShowDate rows is fine).

- [ ] **Step 4: Manual smoke (after Chris applies migration 0006)**

- Create a production with a date → it shows the date on the list and detail.
- On detail, **Edit** → rename (blur) → name updates; add a second date → appears; remove a date → disappears; the countdown reflects the next upcoming date.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** show_dates table + migrate/drop (T1); helpers (T2); data layer list/add/delete (T3); Production drops show_date + updateProduction (T4); show-dates routes (T5); PATCH title (T6); POST first date (T7); detail edit UI + next-upcoming (T8); list next-upcoming (T9). All spec items mapped.
- **Type consistency:** `addShowDate(productionId, date)`, `deleteShowDate(productionId, id)`, `updateProduction(orgId, id, title)`, `nextUpcomingDate(dates, today)`, `listShowDates(ids)` used identically across data, routes, tests, and UI.
- **Breaking change handled:** every `show_date`/`showDate` reference found by grep is updated (productions.ts, both route files + their tests, list page, detail page). `CountdownBadge` already accepts `string | null`, so no change there.
