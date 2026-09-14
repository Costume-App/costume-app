# Ensemble Roles & Performer Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a role be marked ensemble (a flat list of performers, no primary/understudies) and let an existing performer be cast into more roles so their single set of measurements is reused.

**Architecture:** Add `roles.is_ensemble` and a third casting assignment value `ensemble` (migration 0030, plus a `set_role_ensemble` SQL function that converts castings atomically). `addCastMember` accepts an existing `performerId`; a new `removeCasting` unassigns one role and deletes the performer only when it was their last casting. The Cast & Measure panel gains an ensemble toggle, an ensemble list, and a picker that offers existing performers before "+ Add new".

**Tech Stack:** Next.js 16 App Router (route handlers with `params: Promise<…>`), TypeScript strict, Supabase via `supabaseAdmin` (service role), Vitest (node env, chained query-builder mocks), Tailwind 4 + the app's globals.css classes (`field`, `btn-ghost`, `link-muted`, `lbl`, `muted`, `surface`).

**Spec:** `docs/superpowers/specs/2026-09-14-ensemble-roles-and-performer-reuse-design.md`

## Global Constraints

- Branch: `feat/ensemble-roles` (already checked out; stacked on `feat/cast-list-sort`). Commit per task. **Never push, never deploy, never apply the migration** — Chris applies migrations to the shared Supabase himself and gives the green light for pushes.
- Verify with `npx vitest run <file>` per task; `npx tsc --noEmit` (tsconfig includes test files, so test code must typecheck too).
- This is Next.js 16 — before writing route/page code, skim the relevant guide in `node_modules/next/dist/docs/` if anything differs from the existing route files you're copying.
- Reuse scope is **one production**: performers stay `production_id`-scoped.
- Ensemble lists are **per cast**.
- Removal copy: other castings remain → `Remove {name} from {role}?`; last casting → `Remove {name}? This is their only role, so their measurements will be deleted too.`
- Toggle copy: to ensemble → `{n} cast member(s) will become ensemble member(s).`; to regular → `The first-added member in each cast becomes primary; the rest become understudies.` Only confirm when the role has ≥1 casting (any cast).
- Collapsed ensemble row summary: `Ensemble · {n}` (n = castings for the selected cast).
- Picker: Enter/submit **always adds new**; it never silently reuses a same-named performer.
- Commit message trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## File Map

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/0030_ensemble_roles.sql` | create | `is_ensemble` column, assignment check, `set_role_ensemble()` |
| `src/lib/casting-assignment.ts` (+ test) | create | client-safe `Assignment` type, `isAssignment`, `assignmentShortTag` |
| `src/lib/tailor-summary.ts`, `src/components/TailorSummary.tsx`, `src/components/MakePieceRow.tsx` | modify | widen assignment type; `· ens` tag |
| `src/lib/data/roles.ts` (+ `roles.test.ts`, new `roles-ensemble.test.ts`) | modify | `is_ensemble` on create/copy; `setRoleEnsemble` |
| `src/lib/data/production-copy.ts` (+ test) | modify | copy `is_ensemble` |
| `src/app/api/productions/[id]/roles/route.ts`, `.../roles/[roleId]/route.ts` (+ tests) | modify | `isEnsemble` on POST / PATCH |
| `src/lib/data/performers.ts` (+ new `performers-get.test.ts`) | modify | `getPerformer` |
| `src/lib/data/castings.ts` (+ `castings.test.ts`, new `castings-remove.test.ts`) | modify | reuse by `performerId`, role-type validation, `removeCasting` |
| `src/app/api/productions/[id]/castings/route.ts` (+ test) | modify | POST `performerId`/`ensemble`; new GET |
| `src/app/api/productions/[id]/castings/[castingId]/route.ts` (+ test) | create | DELETE one casting |
| `src/lib/performer-picker.ts` (+ test) | create | picker candidates, role summaries, last-casting check |
| `src/lib/role-sort.test.ts` | modify | ensemble-role sort case |
| `src/components/ProductionWorkspace.tsx`, `RoleCard.tsx`, `RoleSuggestionBanner.tsx`, `src/app/(app)/productions/[id]/page.tsx` | modify | `Role.isEnsemble`, add-role checkbox, collapsed summary, pass roles/casts down |
| `src/components/PerformerPicker.tsx` | create | input + existing-performer dropdown + "+ Add new" |
| `src/components/RoleCastPanel.tsx` | modify | toggle, ensemble list, picker, casting-level removal |
| `src/components/RoleCostumePanel.tsx` | modify | include ensemble castings |
| `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx` | modify | header lists all castings |
| `src/app/(app)/guide/page.tsx` | modify | one sentence |

---

### Task 1: Migration + shared assignment type + summary widening

**Files:**
- Create: `supabase/migrations/0030_ensemble_roles.sql`
- Create: `src/lib/casting-assignment.ts`
- Test: `src/lib/casting-assignment.test.ts`
- Modify: `src/lib/tailor-summary.ts` (lines ~35 and ~106), `src/lib/tailor-summary.test.ts` (append), `src/components/TailorSummary.tsx:20`, `src/components/MakePieceRow.tsx:152-155`, `src/components/ProductionWorkspace.tsx:23-29`

**Interfaces:**
- Produces: `export const ASSIGNMENTS = ["primary", "understudy", "ensemble"] as const; export type Assignment; export function isAssignment(v: unknown): v is Assignment; export function assignmentShortTag(a: Assignment): string` (returns `""`, `" · u/s"`, `" · ens"`).
- Produces: DB column `roles.is_ensemble boolean not null default false`; SQL function `set_role_ensemble(p_role_id uuid, p_is_ensemble boolean) returns void`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0030_ensemble_roles.sql`:

```sql
-- Ensemble roles: a role with no primary/understudies, just performers who need costumes.
alter table roles add column if not exists is_ensemble boolean not null default false;

-- Allow the new assignment value. 0003 declared the check inline, so Postgres named it
-- castings_assignment_check.
alter table castings drop constraint if exists castings_assignment_check;
alter table castings add constraint castings_assignment_check
  check (assignment in ('primary', 'understudy', 'ensemble'));

-- Flip a role between regular and ensemble, converting its castings in one transaction.
--   -> ensemble: every casting (all casts) becomes 'ensemble'.
--   -> regular:  per cast, the earliest casting becomes 'primary', the rest 'understudy'.
-- Casting ids never change, so costume_pieces and measurements are untouched.
create or replace function set_role_ensemble(p_role_id uuid, p_is_ensemble boolean)
returns void
language plpgsql
as $$
begin
  update roles set is_ensemble = p_is_ensemble where id = p_role_id;
  if p_is_ensemble then
    update castings set assignment = 'ensemble' where role_id = p_role_id;
  else
    -- Demote everyone first so the one-primary-per-cast index never conflicts.
    update castings set assignment = 'understudy' where role_id = p_role_id;
    update castings c set assignment = 'primary'
    from (
      select distinct on (cast_id) id
      from castings
      where role_id = p_role_id
      order by cast_id, created_at, id
    ) firsts
    where c.id = firsts.id;
  end if;
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function set_role_ensemble(uuid, boolean) from public, anon, authenticated;
```

- [ ] **Step 2: Write the failing test for the assignment module**

`src/lib/casting-assignment.test.ts`:

```ts
import { expect, test } from "vitest";
import { ASSIGNMENTS, isAssignment, assignmentShortTag } from "@/lib/casting-assignment";

test("ASSIGNMENTS lists the three values", () => {
  expect(ASSIGNMENTS).toEqual(["primary", "understudy", "ensemble"]);
});

test("isAssignment accepts only known values", () => {
  expect(isAssignment("primary")).toBe(true);
  expect(isAssignment("understudy")).toBe(true);
  expect(isAssignment("ensemble")).toBe(true);
  expect(isAssignment("lead")).toBe(false);
  expect(isAssignment(undefined)).toBe(false);
});

test("assignmentShortTag labels non-primary rows", () => {
  expect(assignmentShortTag("primary")).toBe("");
  expect(assignmentShortTag("understudy")).toBe(" · u/s");
  expect(assignmentShortTag("ensemble")).toBe(" · ens");
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/casting-assignment.test.ts`
Expected: FAIL — cannot resolve `@/lib/casting-assignment`.

- [ ] **Step 4: Implement**

`src/lib/casting-assignment.ts`:

```ts
// Client-safe casting assignment values (no server imports — used by components too).
export const ASSIGNMENTS = ["primary", "understudy", "ensemble"] as const;
export type Assignment = (typeof ASSIGNMENTS)[number];

export function isAssignment(v: unknown): v is Assignment {
  return typeof v === "string" && (ASSIGNMENTS as readonly string[]).includes(v);
}

// Compact suffix for summary rows, e.g. "Cast A · u/s".
export function assignmentShortTag(a: Assignment): string {
  if (a === "understudy") return " · u/s";
  if (a === "ensemble") return " · ens";
  return "";
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `npx vitest run src/lib/casting-assignment.test.ts` → PASS (3 tests).

- [ ] **Step 6: Add a tailor-summary test proving ensemble castings flow through**

Append to `src/lib/tailor-summary.test.ts` (it already defines `roles`, `designs`, `performers`, `casts` at module scope and imports `buildMakeWorklist`):

```ts
test("buildMakeWorklist includes ensemble castings as make items", () => {
  const ensembleCastings = [
    { id: "e1", cast_id: "castA", role_id: "r2", performer_id: "p1", assignment: "ensemble" as const },
    { id: "e2", cast_id: "castA", role_id: "r2", performer_id: "p2", assignment: "ensemble" as const },
  ];
  const wl = buildMakeWorklist(roles, designs, ensembleCastings, performers, casts, []);
  const page = wl.roles.find((r) => r.roleName === "Page")!;
  expect(page.garments[0].items.map((i) => [i.performerName, i.assignment])).toEqual([
    ["Ada", "ensemble"],
    ["Bea", "ensemble"],
  ]);
});
```

- [ ] **Step 7: Run it — expect a type error only under tsc, runtime PASS**

Run: `npx vitest run src/lib/tailor-summary.test.ts` → PASS at runtime.
Run: `npx tsc --noEmit` → FAIL: `"ensemble"` not assignable to `"primary" | "understudy"`.

- [ ] **Step 8: Widen the types**

In `src/lib/tailor-summary.ts` add `import type { Assignment } from "@/lib/casting-assignment";` at the top, then change `MakeItem.assignment` to `assignment: Assignment;` and `CastingLike` to:

```ts
interface CastingLike { id: string; cast_id: string; role_id: string; performer_id: string; assignment: Assignment }
```

In `src/components/TailorSummary.tsx` add `import type { Assignment } from "@/lib/casting-assignment";` and change line 20 to:

```ts
interface Casting { id: string; cast_id: string; role_id: string; performer_id: string; assignment: Assignment }
```

In `src/components/ProductionWorkspace.tsx` add `import type { Assignment } from "@/lib/casting-assignment";` and change the `Casting` interface's field to `assignment: Assignment;`.

In `src/components/MakePieceRow.tsx` add `import { assignmentShortTag } from "@/lib/casting-assignment";` and replace

```tsx
            {item.assignment === "understudy" ? " · u/s" : ""}
```

with

```tsx
            {assignmentShortTag(item.assignment)}
```

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit` → no errors. Run: `npx vitest run src/lib/tailor-summary.test.ts src/lib/casting-assignment.test.ts` → PASS.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0030_ensemble_roles.sql src/lib/casting-assignment.ts src/lib/casting-assignment.test.ts src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts src/components/TailorSummary.tsx src/components/MakePieceRow.tsx src/components/ProductionWorkspace.tsx
git commit -m "feat(ensemble): migration 0030 + shared Assignment type with ensemble

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Roles — `is_ensemble` on create/copy, `setRoleEnsemble`, role API

**Files:**
- Modify: `src/lib/data/roles.ts`, `src/lib/data/roles.test.ts:43-48`
- Create test: `src/lib/data/roles-ensemble.test.ts`
- Modify: `src/lib/data/production-copy.ts:31-36`, `src/lib/data/production-copy.test.ts:52,65` (and the second test's `listRoles` fixture)
- Modify: `src/app/api/productions/[id]/roles/route.ts`, `src/app/api/productions/[id]/roles/[roleId]/route.ts`, `src/app/api/productions/[id]/roles/[roleId]/route.test.ts`, `src/app/api/productions/[id]/roles/route.test.ts`

**Interfaces:**
- Consumes: SQL function `set_role_ensemble(p_role_id, p_is_ensemble)` from Task 1.
- Produces: `Role.is_ensemble: boolean`; `createRole(input: { productionId: string; name: string; isEnsemble?: boolean }): Promise<Role>`; `setRoleEnsemble(productionId: string, id: string, isEnsemble: boolean): Promise<Role>`; `insertRoleCopy(input: { productionId; name; notes; displayOrder; isEnsemble: boolean })`.
- Produces API: `POST /api/productions/[id]/roles` body `{ name, isEnsemble? }` → `{ role }` 201; `PATCH /api/productions/[id]/roles/[roleId]` body `{ isEnsemble: boolean }` → `{ role }`.

- [ ] **Step 1: Write failing data tests**

`src/lib/data/roles-ensemble.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const eqProd = vi.fn(() => ({ maybeSingle }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const select = vi.fn((_cols: string) => ({ eq: eqId }));
const from = vi.fn((_table: string) => ({ select }));
const rpc = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (...a: unknown[]) => rpc(...a) },
}));

import { setRoleEnsemble } from "@/lib/data/roles";

beforeEach(() => {
  [maybeSingle, eqProd, eqId, select, from, rpc].forEach((m) => m.mockReset());
  eqProd.mockReturnValue({ maybeSingle });
  eqId.mockReturnValue({ eq: eqProd });
  select.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ select });
});

test("setRoleEnsemble checks the role is in the production, calls the RPC, returns the updated role", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", name: "Villagers", is_ensemble: false }, error: null });
  rpc.mockResolvedValue({ error: null });
  const role = await setRoleEnsemble("p1", "r1", true);
  expect(from).toHaveBeenCalledWith("roles");
  expect(eqId).toHaveBeenCalledWith("id", "r1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(rpc).toHaveBeenCalledWith("set_role_ensemble", { p_role_id: "r1", p_is_ensemble: true });
  expect(role).toEqual({ id: "r1", name: "Villagers", is_ensemble: true });
});

test("setRoleEnsemble throws NotFoundError for a role outside the production and skips the RPC", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setRoleEnsemble("p1", "rX", true)).rejects.toBeInstanceOf(NotFoundError);
  expect(rpc).not.toHaveBeenCalled();
});

test("setRoleEnsemble surfaces an RPC error", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", is_ensemble: true }, error: null });
  rpc.mockResolvedValue({ error: { message: "boom" } });
  await expect(setRoleEnsemble("p1", "r1", false)).rejects.toThrow("boom");
});
```

In `src/lib/data/roles.test.ts`, replace the `createRole inserts a trimmed name` test with:

```ts
test("createRole inserts a trimmed name, regular by default", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r2", name: "Mary Poppins" }, error: null });
  const row = await createRole({ productionId: "p1", name: "  Mary Poppins  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Mary Poppins", is_ensemble: false });
  expect(row).toEqual({ id: "r2", name: "Mary Poppins" });
});

test("createRole can create an ensemble role", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r3", name: "Villagers", is_ensemble: true }, error: null });
  await createRole({ productionId: "p1", name: "Villagers", isEnsemble: true });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Villagers", is_ensemble: true });
});
```

- [ ] **Step 2: Run to confirm failures**

Run: `npx vitest run src/lib/data/roles-ensemble.test.ts src/lib/data/roles.test.ts`
Expected: FAIL — `setRoleEnsemble` is not exported; `createRole` insert lacks `is_ensemble`.

- [ ] **Step 3: Implement in `src/lib/data/roles.ts`**

Add `is_ensemble: boolean;` to the `Role` interface (after `notes`). Replace `createRole` with:

```ts
export async function createRole(input: {
  productionId: string;
  name: string;
  isEnsemble?: boolean;
}): Promise<Role> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Role name is required");
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ production_id: input.productionId, name, is_ensemble: input.isEnsemble === true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}
```

Add after `setRoleNotes`:

```ts
// Flip a role between regular and ensemble. The set_role_ensemble SQL function converts the
// role's castings in the same transaction (see migration 0030).
export async function setRoleEnsemble(productionId: string, id: string, isEnsemble: boolean): Promise<Role> {
  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!role) throw new NotFoundError("Role not found");
  const { error: rpcError } = await supabaseAdmin.rpc("set_role_ensemble", {
    p_role_id: id,
    p_is_ensemble: isEnsemble,
  });
  if (rpcError) throw new Error(rpcError.message);
  return { ...(role as Role), is_ensemble: isEnsemble };
}
```

Replace `insertRoleCopy` with:

```ts
// Insert a role preserving name/notes/display_order/is_ensemble (used by the share copy engine).
export async function insertRoleCopy(input: {
  productionId: string;
  name: string;
  notes: string | null;
  displayOrder: number;
  isEnsemble: boolean;
}): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({
      production_id: input.productionId,
      name: input.name,
      notes: input.notes,
      display_order: input.displayOrder,
      is_ensemble: input.isEnsemble,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}
```

- [ ] **Step 4: Update the share copy + its test**

In `src/lib/data/production-copy.ts`, inside the roles loop add `isEnsemble: role.is_ensemble,` to the `insertRoleCopy({...})` call.

In `src/lib/data/production-copy.test.ts`: change both `listRoles.mockResolvedValue([{ id: "r1", name: "Wizard", notes: …, display_order: 0 }])` fixtures to include `is_ensemble: true`, and change the assertion to:

```ts
  expect(insertRoleCopy).toHaveBeenCalledWith({ productionId: "p2", name: "Wizard", notes: "fl", displayOrder: 0, isEnsemble: true });
```

- [ ] **Step 5: Run data tests**

Run: `npx vitest run src/lib/data/roles-ensemble.test.ts src/lib/data/roles.test.ts src/lib/data/production-copy.test.ts` → PASS.

- [ ] **Step 6: Write failing route tests**

In `src/app/api/productions/[id]/roles/[roleId]/route.test.ts`, add `const setRoleEnsemble = vi.fn();` next to the other mocks, add `setRoleEnsemble: (...a: unknown[]) => setRoleEnsemble(...a),` to the `vi.mock("@/lib/data/roles", …)` factory, add `setRoleEnsemble` to the `beforeEach` reset array, and append:

```ts
test("PATCH with isEnsemble flips the role via setRoleEnsemble (200)", async () => {
  setRoleEnsemble.mockResolvedValue({ id: "r1", name: "Villagers", is_ensemble: true });
  const res = await PATCH(patchReq({ isEnsemble: true }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: "r1", name: "Villagers", is_ensemble: true } });
  expect(setRoleEnsemble).toHaveBeenCalledWith("p1", "r1", true);
  expect(updateRole).not.toHaveBeenCalled();
  expect(setRoleNotes).not.toHaveBeenCalled();
});
```

Open `src/app/api/productions/[id]/roles/route.test.ts`, find the existing single-role POST test that asserts `createRole` was called, and update/add so that:

```ts
test("POST passes isEnsemble to createRole", async () => {
  createRole.mockResolvedValue({ id: "r9", name: "Villagers", is_ensemble: true });
  const res = await POST(postReq({ name: "Villagers", isEnsemble: true }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createRole).toHaveBeenCalledWith({ productionId: "p1", name: "Villagers", isEnsemble: true });
});
```

(Use that file's existing mock names / request helpers; if its helper is named differently, adapt the helper name only.) Any existing assertion of `createRole` being called with `{ productionId, name }` must now include `isEnsemble: false`.

- [ ] **Step 7: Run to confirm failures**

Run: `npx vitest run "src/app/api/productions/[id]/roles"` → FAIL on the new tests.

- [ ] **Step 8: Implement the routes**

`src/app/api/productions/[id]/roles/route.ts` POST — replace the body type and single-create line:

```ts
    const body = (await request.json()) as { name?: string; names?: string[]; isEnsemble?: boolean };
    if (Array.isArray(body.names)) {
      const roles = await createRoles({ productionId: id, names: body.names });
      return NextResponse.json({ roles }, { status: 201 });
    }
    const role = await createRole({
      productionId: id,
      name: typeof body.name === "string" ? body.name : "",
      isEnsemble: body.isEnsemble === true,
    });
```

`src/app/api/productions/[id]/roles/[roleId]/route.ts` — import `setRoleEnsemble` alongside the others and make PATCH:

```ts
    const body = (await request.json()) as { name?: string; notes?: string; isEnsemble?: boolean };
    if (typeof body.isEnsemble === "boolean") {
      const role = await setRoleEnsemble(id, roleId, body.isEnsemble);
      return NextResponse.json({ role });
    }
    if (typeof body.name === "string") {
```

(rest unchanged).

- [ ] **Step 9: Verify + commit**

Run: `npx vitest run "src/app/api/productions/[id]/roles" src/lib/data` → PASS. Run: `npx tsc --noEmit` → no errors (fix any caller of `insertRoleCopy`/`Role` the compiler flags).

```bash
git add src/lib/data/roles.ts src/lib/data/roles.test.ts src/lib/data/roles-ensemble.test.ts src/lib/data/production-copy.ts src/lib/data/production-copy.test.ts "src/app/api/productions/[id]/roles"
git commit -m "feat(ensemble): is_ensemble on roles — create, copy, and PATCH toggle via set_role_ensemble

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Castings — reuse an existing performer, remove one casting, castings API

**Files:**
- Modify: `src/lib/data/performers.ts` (add `getPerformer`); Create test: `src/lib/data/performers-get.test.ts`
- Modify: `src/lib/data/castings.ts`, `src/lib/data/castings.test.ts`; Create test: `src/lib/data/castings-remove.test.ts`
- Modify: `src/app/api/productions/[id]/castings/route.ts`, `.../castings/route.test.ts`
- Create: `src/app/api/productions/[id]/castings/[castingId]/route.ts`, `.../[castingId]/route.test.ts`

**Interfaces:**
- Consumes: `Assignment`, `isAssignment` from `@/lib/casting-assignment` (Task 1); `Role.is_ensemble` (Task 2).
- Produces: `getPerformer(id: string): Promise<Performer | null>`.
- Produces: `addCastMember(input: { productionId: string; castId: string; roleId: string; roleIsEnsemble: boolean; assignment: Assignment; name?: string; performerId?: string }): Promise<{ performer: Performer; casting: Casting }>`.
- Produces: `removeCasting(productionId: string, castingId: string): Promise<{ performerDeleted: boolean }>`.
- Produces API: `GET /api/productions/[id]/castings` → `{ castings: Casting[] }` (snake_case rows); `POST` body `{ castId, roleId, assignment, name? , performerId? }` → `{ performer, casting }` 201; `DELETE /api/productions/[id]/castings/[castingId]` → `{ ok: true, performerDeleted: boolean }`.
- `export type { Assignment }` stays importable from `@/lib/data/castings` (re-export).

- [ ] **Step 1: Failing test for `getPerformer`**

`src/lib/data/performers-get.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn((_cols: string) => ({ eq }));
const from = vi.fn((_t: string) => ({ select }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { getPerformer } from "@/lib/data/performers";

beforeEach(() => {
  [maybeSingle, eq, select, from].forEach((m) => m.mockReset());
  eq.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
});

test("getPerformer returns the row by id", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "pf1", production_id: "p1", label: "Amy" }, error: null });
  expect(await getPerformer("pf1")).toEqual({ id: "pf1", production_id: "p1", label: "Amy" });
  expect(from).toHaveBeenCalledWith("performers");
  expect(eq).toHaveBeenCalledWith("id", "pf1");
});

test("getPerformer returns null when missing", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await getPerformer("nope")).toBeNull();
});
```

Run: `npx vitest run src/lib/data/performers-get.test.ts` → FAIL (not exported).

- [ ] **Step 2: Implement `getPerformer`** — in `src/lib/data/performers.ts` after `deletePerformer`:

```ts
export async function getPerformer(id: string): Promise<Performer | null> {
  const { data, error } = await supabaseAdmin.from("performers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Performer | null) ?? null;
}
```

Run the test → PASS.

- [ ] **Step 3: Failing tests for `addCastMember` changes**

In `src/lib/data/castings.test.ts`:
1. Add `const getPerformer = vi.fn();` and `getPerformer: (...a: unknown[]) => getPerformer(...a),` to the performers mock; add `getPerformer` to the reset array.
2. Add `roleIsEnsemble: false,` to every existing `addCastMember({...})` call.
3. Append:

```ts
test("addCastMember with performerId reuses the existing performer (no create, no rollback)", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "p1", label: "Amy" });
  insertSingle.mockResolvedValue({
    data: { id: "c5", cast_id: "ct1", role_id: "r2", performer_id: "pf1", assignment: "ensemble" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    castId: "ct1",
    roleId: "r2",
    roleIsEnsemble: true,
    performerId: "pf1",
    assignment: "ensemble",
  });
  expect(createPerformer).not.toHaveBeenCalled();
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    cast_id: "ct1",
    role_id: "r2",
    performer_id: "pf1",
    assignment: "ensemble",
  });
  expect(result.performer).toEqual({ id: "pf1", production_id: "p1", label: "Amy" });
});

test("addCastMember rejects a performer from another production", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "OTHER", label: "Amy" });
  const { NotFoundError } = await import("@/lib/errors");
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, performerId: "pf1", assignment: "primary" }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(insert).not.toHaveBeenCalled();
});

test("addCastMember rejects primary/understudy on an ensemble role and ensemble on a regular role", async () => {
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: true, name: "Ava", assignment: "primary" }),
  ).rejects.toBeInstanceOf(ValidationError);
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, name: "Ava", assignment: "ensemble" }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(createPerformer).not.toHaveBeenCalled();
});

test("addCastMember maps a duplicate performer-in-role to a specific message and does not delete a reused performer", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "p1", label: "Amy" });
  insertSingle.mockResolvedValue({
    data: null,
    error: { code: "23505", message: 'duplicate key value violates unique constraint "castings_cast_role_performer_key"' },
  });
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, performerId: "pf1", assignment: "understudy" }),
  ).rejects.toThrow("That performer is already in this role for this cast.");
  expect(deletePerformer).not.toHaveBeenCalled();
});
```

Run: `npx vitest run src/lib/data/castings.test.ts` → FAIL on the new tests.

- [ ] **Step 4: Implement `addCastMember` + `removeCasting`**

Replace the top of `src/lib/data/castings.ts` through the end of `addCastMember` with:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createPerformer, deletePerformer, getPerformer, type Performer } from "@/lib/data/performers";
import { isAssignment, type Assignment } from "@/lib/casting-assignment";

export type { Assignment };

export interface Casting {
  id: string;
  production_id: string;
  cast_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
  created_at: string;
}
```

(keep `listCastings` as is), then:

```ts
// Cast someone in a role. Pass `performerId` to reuse an existing performer from this production
// (their measurements come along), or `name` to create a new performer.
export async function addCastMember(input: {
  productionId: string;
  castId: string;
  roleId: string;
  roleIsEnsemble: boolean;
  assignment: Assignment;
  name?: string;
  performerId?: string;
}): Promise<{ performer: Performer; casting: Casting }> {
  if (!isAssignment(input.assignment)) {
    throw new ValidationError("Invalid assignment");
  }
  if (input.roleIsEnsemble !== (input.assignment === "ensemble")) {
    throw new ValidationError(
      input.roleIsEnsemble
        ? "Ensemble roles don't have a primary or understudies."
        : "Only ensemble roles take ensemble members.",
    );
  }

  let performer: Performer;
  let created = false;
  if (input.performerId) {
    const existing = await getPerformer(input.performerId);
    if (!existing || existing.production_id !== input.productionId) {
      throw new NotFoundError("Performer not found");
    }
    performer = existing;
  } else {
    performer = await createPerformer({ productionId: input.productionId, label: input.name ?? "" });
    created = true;
  }

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
  if (error) {
    // Only roll back a performer we just created — never delete a reused one.
    if (created) await deletePerformer(performer.id);
    if (error.code === "23505") {
      if (error.message.includes("castings_cast_role_performer_key")) {
        throw new ValidationError("That performer is already in this role for this cast.");
      }
      throw new ValidationError("This role already has a primary for this cast.");
    }
    throw new Error(error.message);
  }
  return { performer, casting: data as Casting };
}

// Unassign one casting. If the performer has no castings left anywhere in the production,
// delete the performer too (their measurements cascade).
export async function removeCasting(
  productionId: string,
  castingId: string,
): Promise<{ performerDeleted: boolean }> {
  const { data: casting, error: findError } = await supabaseAdmin
    .from("castings")
    .select("performer_id")
    .eq("id", castingId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!casting) throw new NotFoundError("Casting not found");

  const { error: deleteError } = await supabaseAdmin.from("castings").delete().eq("id", castingId);
  if (deleteError) throw new Error(deleteError.message);

  const performerId = (casting as { performer_id: string }).performer_id;
  const { data: remaining, error: remainingError } = await supabaseAdmin
    .from("castings")
    .select("id")
    .eq("performer_id", performerId)
    .limit(1);
  if (remainingError) throw new Error(remainingError.message);
  if (remaining && remaining.length > 0) return { performerDeleted: false };

  await deletePerformer(performerId);
  return { performerDeleted: true };
}
```

Run: `npx vitest run src/lib/data/castings.test.ts` → PASS.

- [ ] **Step 5: Tests for `removeCasting`**

`src/lib/data/castings-remove.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

// select("performer_id") -> .eq(id).eq(production).maybeSingle()   (find)
// select("id")           -> .eq(performer_id).limit(1)             (remaining)
// delete()               -> .eq(id)
const findMaybeSingle = vi.fn();
const findEqProd = vi.fn(() => ({ maybeSingle: findMaybeSingle }));
const findEqId = vi.fn(() => ({ eq: findEqProd }));
const remainingLimit = vi.fn();
const remainingEq = vi.fn(() => ({ limit: remainingLimit }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));
const select = vi.fn((cols: string) => (cols === "performer_id" ? { eq: findEqId } : { eq: remainingEq }));
const from = vi.fn((_t: string) => ({ select, delete: del }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

const deletePerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  createPerformer: vi.fn(),
  getPerformer: vi.fn(),
  deletePerformer: (...a: unknown[]) => deletePerformer(...a),
}));

import { removeCasting } from "@/lib/data/castings";

beforeEach(() => {
  [findMaybeSingle, findEqProd, findEqId, remainingLimit, remainingEq, deleteEq, del, select, from, deletePerformer].forEach(
    (m) => m.mockReset(),
  );
  findEqProd.mockReturnValue({ maybeSingle: findMaybeSingle });
  findEqId.mockReturnValue({ eq: findEqProd });
  remainingEq.mockReturnValue({ limit: remainingLimit });
  del.mockReturnValue({ eq: deleteEq });
  select.mockImplementation((cols: string) => (cols === "performer_id" ? { eq: findEqId } : { eq: remainingEq }));
  from.mockReturnValue({ select, delete: del });
  deleteEq.mockResolvedValue({ error: null });
});

test("removes only the casting when the performer has other roles", async () => {
  findMaybeSingle.mockResolvedValue({ data: { performer_id: "pf1" }, error: null });
  remainingLimit.mockResolvedValue({ data: [{ id: "c2" }], error: null });
  expect(await removeCasting("p1", "c1")).toEqual({ performerDeleted: false });
  expect(findEqId).toHaveBeenCalledWith("id", "c1");
  expect(findEqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(deleteEq).toHaveBeenCalledWith("id", "c1");
  expect(remainingEq).toHaveBeenCalledWith("performer_id", "pf1");
  expect(deletePerformer).not.toHaveBeenCalled();
});

test("deletes the performer when it was their last casting", async () => {
  findMaybeSingle.mockResolvedValue({ data: { performer_id: "pf1" }, error: null });
  remainingLimit.mockResolvedValue({ data: [], error: null });
  deletePerformer.mockResolvedValue(undefined);
  expect(await removeCasting("p1", "c1")).toEqual({ performerDeleted: true });
  expect(deletePerformer).toHaveBeenCalledWith("pf1");
});

test("404s a casting outside the production without deleting anything", async () => {
  findMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(removeCasting("p1", "cX")).rejects.toBeInstanceOf(NotFoundError);
  expect(del).not.toHaveBeenCalled();
});
```

Run: `npx vitest run src/lib/data/castings-remove.test.ts` → PASS (implementation already written in Step 4; if any fail, fix the implementation, not the expectations).

- [ ] **Step 6: Failing castings route tests (POST + GET)**

In `src/app/api/productions/[id]/castings/route.test.ts`:
1. Change the castings mock to `const addCastMember = vi.fn(); const listCastings = vi.fn(); vi.mock("@/lib/data/castings", () => ({ addCastMember: (...a: unknown[]) => addCastMember(...a), listCastings: (...a: unknown[]) => listCastings(...a) }));` and add `listCastings` to the reset array.
2. Import: `import { GET, POST } from "@/app/api/productions/[id]/castings/route";`
3. In `beforeEach` change roles to `listRoles.mockResolvedValue([{ id: "r1", name: "Bert", is_ensemble: false }, { id: "r2", name: "Villagers", is_ensemble: true }]);`
4. In "POST adds a cast member (201)" change the expected call to include `roleIsEnsemble: false,`.
5. Append:

```ts
test("POST with performerId reuses a performer on an ensemble role", async () => {
  addCastMember.mockResolvedValue({
    performer: { id: "pf1", label: "Amy" },
    casting: { id: "c5", cast_id: "ct1", role_id: "r2", performer_id: "pf1", assignment: "ensemble" },
  });
  const res = await POST(postReq({ castId: "ct1", roleId: "r2", performerId: "pf1", assignment: "ensemble" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    castId: "ct1",
    roleId: "r2",
    roleIsEnsemble: true,
    assignment: "ensemble",
    performerId: "pf1",
  });
});

test("POST defaults a missing assignment to ensemble for ensemble roles", async () => {
  addCastMember.mockResolvedValue({ performer: {}, casting: {} });
  await POST(postReq({ castId: "ct1", roleId: "r2", name: "Zed" }), ctx("p1"));
  expect(addCastMember).toHaveBeenCalledWith(expect.objectContaining({ assignment: "ensemble", name: "Zed" }));
});

test("GET lists the production's castings", async () => {
  listCastings.mockResolvedValue([{ id: "c1", assignment: "primary" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ castings: [{ id: "c1", assignment: "primary" }] });
  expect(listCastings).toHaveBeenCalledWith("p1");
});

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});
```

Run: `npx vitest run "src/app/api/productions/[id]/castings/route.test.ts"` → FAIL.

- [ ] **Step 7: Implement the castings route**

Replace `src/app/api/productions/[id]/castings/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { addCastMember, listCastings } from "@/lib/data/castings";
import { isAssignment } from "@/lib/casting-assignment";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const castings = await listCastings(id);
    return NextResponse.json({ castings });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      castId?: string;
      roleId?: string;
      name?: string;
      performerId?: string;
      assignment?: string;
    };
    const castId = String(body.castId ?? "");
    const roleId = String(body.roleId ?? "");

    const [roles, casts] = await Promise.all([listRoles(id), listCasts(id)]);
    const role = roles.find((r) => r.id === roleId);
    if (!role) throw new NotFoundError("Role not found");
    if (!casts.some((c) => c.id === castId)) throw new NotFoundError("Cast not found");

    const who =
      typeof body.performerId === "string" && body.performerId
        ? { performerId: body.performerId }
        : { name: typeof body.name === "string" ? body.name : "" };

    const result = await addCastMember({
      productionId: id,
      castId,
      roleId,
      roleIsEnsemble: role.is_ensemble,
      assignment: isAssignment(body.assignment) ? body.assignment : role.is_ensemble ? "ensemble" : "primary",
      ...who,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Run the route test → PASS.

- [ ] **Step 8: DELETE route (test first)**

`src/app/api/productions/[id]/castings/[castingId]/route.test.ts`:

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

const removeCasting = vi.fn();
vi.mock("@/lib/data/castings", () => ({ removeCasting: (...a: unknown[]) => removeCasting(...a) }));

import { DELETE } from "@/app/api/productions/[id]/castings/[castingId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, removeCasting].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, castingId: string) => ({ params: Promise.resolve({ id, castingId }) });
const delReq = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the casting and reports whether the performer was deleted", async () => {
  removeCasting.mockResolvedValue({ performerDeleted: true });
  const res = await DELETE(delReq(), ctx("p1", "c1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, performerDeleted: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(removeCasting).toHaveBeenCalledWith("p1", "c1");
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(delReq(), ctx("p1", "c1"));
  expect(res.status).toBe(404);
  expect(removeCasting).not.toHaveBeenCalled();
});

test("DELETE 404 when the casting is not in the production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  removeCasting.mockRejectedValue(new NotFoundError("Casting not found"));
  const res = await DELETE(delReq(), ctx("p1", "cX"));
  expect(res.status).toBe(404);
});
```

Run it → FAIL (module missing). Then create `src/app/api/productions/[id]/castings/[castingId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { removeCasting } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string; castingId: string }> };

// Unassign one casting. removeCasting scopes its lookup to the production, so a casting from
// another production 404s; the performer is deleted only if this was their last casting.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, castingId } = await params;
    await assertProductionInOrg(orgId, id);
    const { performerDeleted } = await removeCasting(id, castingId);
    return NextResponse.json({ ok: true, performerDeleted });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Run it → PASS.

- [ ] **Step 9: Verify + commit**

Run: `npx vitest run src/lib/data "src/app/api/productions/[id]/castings"` → PASS. Run: `npx tsc --noEmit` → no errors.

```bash
git add src/lib/data/performers.ts src/lib/data/performers-get.test.ts src/lib/data/castings.ts src/lib/data/castings.test.ts src/lib/data/castings-remove.test.ts "src/app/api/productions/[id]/castings"
git commit -m "feat(ensemble): reuse existing performers in castings; per-casting removal; castings GET/DELETE

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pure picker helpers + ensemble sort case

**Files:**
- Create: `src/lib/performer-picker.ts`, `src/lib/performer-picker.test.ts`
- Modify: `src/lib/role-sort.test.ts` (append)

**Interfaces:**
- Produces:
  - `performerRoleSummaries(performers: {id,name}[], castings: {id,castId,roleId,performerId}[], roles: {id,name}[], casts: {id,name}[]): Record<string, string>` — `"Tevye (Cast A), Villagers (Cast B)"`; cast names omitted when the production has ≤1 cast; performers with no castings map to `""`.
  - `pickerCandidates<P extends {id,name}>(query: string, performers: P[], castings: {castId,roleId,performerId}[], target: { castId: string; roleId: string }): P[]` — case-insensitive substring match on trimmed query (empty query = all), excludes performers already in `target` role+cast, sorted by name (natural, case-insensitive).
  - `isLastCasting(performerId: string, castingId: string, castings: {id,performerId}[]): boolean`.

- [ ] **Step 1: Write failing tests**

`src/lib/performer-picker.test.ts`:

```ts
import { expect, test } from "vitest";
import { performerRoleSummaries, pickerCandidates, isLastCasting } from "@/lib/performer-picker";

const performers = [
  { id: "p1", name: "Zoe Adams" },
  { id: "p2", name: "amy Brown" },
  { id: "p3", name: "Mark Cole" },
];
const roles = [
  { id: "r1", name: "Tevye" },
  { id: "r2", name: "Villagers" },
];
const casts = [
  { id: "cA", name: "Cast A" },
  { id: "cB", name: "Cast B" },
];
const castings = [
  { id: "k1", castId: "cA", roleId: "r1", performerId: "p1" },
  { id: "k2", castId: "cB", roleId: "r2", performerId: "p1" },
  { id: "k3", castId: "cA", roleId: "r2", performerId: "p2" },
];

test("performerRoleSummaries lists each performer's roles with cast names", () => {
  expect(performerRoleSummaries(performers, castings, roles, casts)).toEqual({
    p1: "Tevye (Cast A), Villagers (Cast B)",
    p2: "Villagers (Cast A)",
    p3: "",
  });
});

test("performerRoleSummaries omits cast names for single-cast productions", () => {
  expect(performerRoleSummaries(performers, castings, roles, [casts[0]]).p1).toBe("Tevye, Villagers");
});

test("pickerCandidates matches case-insensitively and sorts by name", () => {
  const out = pickerCandidates("a", performers, castings, { castId: "cA", roleId: "r1" });
  // p1 is already Tevye in Cast A → excluded
  expect(out.map((p) => p.id)).toEqual(["p2", "p3"]);
});

test("pickerCandidates with an empty query returns everyone not already in the target", () => {
  const out = pickerCandidates("  ", performers, castings, { castId: "cA", roleId: "r2" });
  expect(out.map((p) => p.name)).toEqual(["Mark Cole", "Zoe Adams"]);
});

test("pickerCandidates allows the same person in the same role for a different cast", () => {
  const out = pickerCandidates("zoe", performers, castings, { castId: "cA", roleId: "r2" });
  expect(out.map((p) => p.id)).toEqual(["p1"]);
});

test("isLastCasting is true only when no other casting has the performer", () => {
  expect(isLastCasting("p1", "k1", castings)).toBe(false);
  expect(isLastCasting("p2", "k3", castings)).toBe(true);
});
```

Append to `src/lib/role-sort.test.ts`:

```ts
test("'performer' puts ensemble roles (no primary) with the unassigned roles", () => {
  const withEnsemble = [
    { id: "r1", name: "Tevye" },
    { id: "rE", name: "Villagers" },
    { id: "r4", name: "Motel" },
  ];
  const ensembleCastings = [
    ...castings,
    { castId: "c1", roleId: "rE", performerId: "p3", assignment: "ensemble" as const },
  ];
  expect(
    names(sortRoles(withEnsemble, "performer", { castings: ensembleCastings, performers, selectedCastId: "c1" })),
  ).toEqual(["Tevye", "Motel", "Villagers"]);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/performer-picker.test.ts src/lib/role-sort.test.ts`
Expected: performer-picker FAILS (module missing); role-sort PASSES already (no code change needed — keep the test as a regression guard).

- [ ] **Step 3: Implement**

`src/lib/performer-picker.ts`:

```ts
interface Named { id: string; name: string }
interface CastingLike { id: string; castId: string; roleId: string; performerId: string }

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// "Tevye (Cast A), Villagers (Cast B)" per performer — shown in the picker so same-named
// performers can be told apart. Cast names are dropped when there's only one cast.
export function performerRoleSummaries(
  performers: Named[],
  castings: CastingLike[],
  roles: Named[],
  casts: Named[],
): Record<string, string> {
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));
  const showCast = casts.length > 1;
  const labels: Record<string, string[]> = {};
  for (const c of castings) {
    const rn = roleName.get(c.roleId);
    if (!rn) continue;
    (labels[c.performerId] ??= []).push(showCast ? `${rn} (${castName.get(c.castId) ?? "—"})` : rn);
  }
  return Object.fromEntries(performers.map((p) => [p.id, (labels[p.id] ?? []).join(", ")]));
}

// Existing performers who could be added to `target` (a role in a cast), filtered by name.
export function pickerCandidates<P extends Named>(
  query: string,
  performers: P[],
  castings: Omit<CastingLike, "id">[],
  target: { castId: string; roleId: string },
): P[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(
    castings.filter((c) => c.castId === target.castId && c.roleId === target.roleId).map((c) => c.performerId),
  );
  return performers
    .filter((p) => !taken.has(p.id) && p.name.toLowerCase().includes(q))
    .sort((a, b) => collator.compare(a.name, b.name));
}

// True when removing `castingId` leaves the performer with no castings (they'll be deleted).
export function isLastCasting(
  performerId: string,
  castingId: string,
  castings: Pick<CastingLike, "id" | "performerId">[],
): boolean {
  return !castings.some((c) => c.performerId === performerId && c.id !== castingId);
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run src/lib/performer-picker.test.ts src/lib/role-sort.test.ts` → PASS. `npx tsc --noEmit` → clean.

```bash
git add src/lib/performer-picker.ts src/lib/performer-picker.test.ts src/lib/role-sort.test.ts
git commit -m "feat(ensemble): picker helpers (candidates, role summaries, last-casting) + sort guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Workspace — `Role.isEnsemble`, add-role checkbox, collapsed summary, prop plumbing

**Files:**
- Modify: `src/components/ProductionWorkspace.tsx`, `src/components/RoleCard.tsx`, `src/components/RoleSuggestionBanner.tsx:67-68`, `src/app/(app)/productions/[id]/page.tsx:140`

**Interfaces:**
- Consumes: `Role.is_ensemble` (Task 2), POST roles `isEnsemble` (Task 2).
- Produces: `export interface Role { id: string; name: string; notes: string | null; isEnsemble: boolean }` in `ProductionWorkspace.tsx`. (The `roles` prop on `RoleCard` and the new `RoleCastPanel` props are added in Task 6, not here.)

No unit tests (node test env, no component tests in this repo); verification is `tsc` + the existing suite.

- [ ] **Step 1: Role type + page mapping + suggestion banner**

`ProductionWorkspace.tsx`:
```ts
export interface Role { id: string; name: string; notes: string | null; isEnsemble: boolean }
```

`src/app/(app)/productions/[id]/page.tsx` — the `initialRoles` prop:
```tsx
        initialRoles={roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes, isEnsemble: r.is_ensemble }))}
```

`RoleSuggestionBanner.tsx` lines 67-68:
```tsx
      const { roles } = (await res.json()) as {
        roles: { id: string; name: string; notes: string | null; is_ensemble?: boolean }[];
      };
      onRolesCreated(roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes, isEnsemble: r.is_ensemble ?? false })));
```

- [ ] **Step 2: Add-role Ensemble checkbox**

In `ProductionWorkspace.tsx` add state next to `newRole`:
```ts
  const [newRoleEnsemble, setNewRoleEnsemble] = useState(false);
```

In `addRole`, change the body and success branch:
```ts
      body: JSON.stringify({ name: newRole, isEnsemble: newRoleEnsemble }),
    });
    if (res.ok) {
      const { role } = (await res.json()) as {
        role: { id: string; name: string; notes: string | null; is_ensemble: boolean };
      };
      setRoles((prev) => [
        ...prev,
        { id: role.id, name: role.name, notes: role.notes, isEnsemble: role.is_ensemble },
      ]);
      setNewRole("");
      setNewRoleEnsemble(false);
```

Replace the add-role form with:
```tsx
      <form onSubmit={addRole} className="flex flex-wrap items-center gap-2">
        <input
          className="field min-w-0 flex-1"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={newRoleEnsemble}
            onChange={(e) => setNewRoleEnsemble(e.target.checked)}
          />
          Ensemble
        </label>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          Add role
        </button>
      </form>
```

- [ ] **Step 3: RoleCard collapsed summary**

In `RoleCard.tsx` replace the `primary`/`summary` block (lines ~71-74) and move `roleCastings` above it:

```ts
  const roleCastings = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = roleCastings.find((c) => c.assignment === "primary");
  const summary = role.isEnsemble
    ? `Ensemble · ${roleCastings.length}`
    : primary
      ? performers.find((p) => p.id === primary.performerId)?.name ?? "—"
      : "—";

  // Collapsed-row indicators.
  const measureAgg = aggregateMeasureStatus(roleCastings.map((c) => measurementStatus[c.performerId] ?? "none"));
```

and delete the later duplicate `const roleCastings = …` line.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → all green. `npx eslint src/components/ProductionWorkspace.tsx src/components/RoleCard.tsx src/components/RoleSuggestionBanner.tsx "src/app/(app)/productions/[id]/page.tsx"` → clean.

```bash
git add src/components/ProductionWorkspace.tsx src/components/RoleCard.tsx src/components/RoleSuggestionBanner.tsx "src/app/(app)/productions/[id]/page.tsx"
git commit -m "feat(ensemble): Role.isEnsemble in the workspace — add-role checkbox, 'Ensemble · N' row summary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cast & Measure panel — toggle, ensemble list, reuse picker, casting removal; Costume panel ordering

**Files:**
- Create: `src/components/PerformerPicker.tsx`
- Modify: `src/components/RoleCastPanel.tsx` (replace `RoleCastPanel` function and `AddName`; keep `CastLink` and `PencilIcon`)
- Modify: `src/components/RoleCard.tsx` (new `roles` prop; pass new props), `src/components/ProductionWorkspace.tsx` (pass `roles` to RoleCard), `src/components/RoleCostumePanel.tsx:261-262`

**Interfaces:**
- Consumes: `pickerCandidates`, `performerRoleSummaries`, `isLastCasting` (Task 4); `GET/POST /api/productions/[id]/castings`, `DELETE /api/productions/[id]/castings/[castingId]` (Task 3); `PATCH /api/productions/[id]/roles/[roleId]` `{ isEnsemble }` (Task 2); `Assignment` (Task 1); `Role.isEnsemble` (Task 5).
- Produces: `PerformerPicker` props `{ placeholder: string; addLabel?: string; block?: boolean; busy: boolean; candidates: (query: string) => PickerCandidate[]; onAddNew: (name: string) => void; onPickExisting: (performerId: string) => void }`, `export interface PickerCandidate { id: string; name: string; summary: string }`. `RoleCastPanel` new props `roles: Role[]`, `setRoles: Dispatch<SetStateAction<Role[]>>`, `casts: Cast[]`.

- [ ] **Step 1: Create `src/components/PerformerPicker.tsx`**

```tsx
"use client";

import { useState } from "react";

export interface PickerCandidate {
  id: string;
  name: string;
  summary: string;
}

// "+ Add …" link that opens a name input. As you type, existing performers in the production are
// offered (with the roles they already play) so their measurements are reused; the last option —
// and pressing Enter — always adds a NEW performer, so a same-named person is never merged silently.
export function PerformerPicker({
  placeholder,
  addLabel,
  block,
  busy,
  candidates,
  onAddNew,
  onPickExisting,
}: {
  placeholder: string;
  addLabel?: string;
  block?: boolean;
  busy: boolean;
  candidates: (query: string) => PickerCandidate[];
  onAddNew: (name: string) => void;
  onPickExisting: (performerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function close() {
    setOpen(false);
    setName("");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        + {addLabel ?? placeholder}
      </button>
    );
  }

  const typed = name.trim();
  const matches = candidates(name).slice(0, 8);

  return (
    <div className={block ? "w-full" : "inline-block"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!typed) return;
          onAddNew(typed);
          close();
        }}
        className={`${block ? "flex w-full flex-wrap" : "inline-flex"} items-center gap-1.5`}
      >
        <input
          autoFocus
          className="field w-44 !p-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button type="submit" disabled={busy || !typed} className="btn-ghost text-sm">
          Add new
        </button>
        <button type="button" onClick={close} className="link-muted text-sm">
          Cancel
        </button>
      </form>
      {(matches.length > 0 || typed) && (
        <ul className="surface mt-1 max-w-sm divide-y divide-[var(--field-line)] !p-0 text-sm">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPickExisting(m.id);
                  close();
                }}
                className="flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-[var(--bg)] disabled:opacity-50"
              >
                <span className="font-medium">{m.name}</span>
                {m.summary && <span className="text-xs muted">{m.summary}</span>}
              </button>
            </li>
          ))}
          {typed && (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onAddNew(typed);
                  close();
                }}
                className="w-full px-2.5 py-1.5 text-left text-[var(--red)] hover:bg-[var(--bg)] disabled:opacity-50"
              >
                + Add new &ldquo;{typed}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `RoleCastPanel` (the exported function) and delete `AddName`**

In `src/components/RoleCastPanel.tsx`, replace the imports and the whole `export function RoleCastPanel(...) { ... }` with the code below; delete the `AddName` function at the bottom. Keep `CastLink` and `PencilIcon` unchanged.

```tsx
"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { MeasurementDot } from "@/components/MeasurementDot";
import { PerformerPicker } from "@/components/PerformerPicker";
import { pickerCandidates, performerRoleSummaries, isLastCasting } from "@/lib/performer-picker";
import type { Assignment } from "@/lib/casting-assignment";
import type { MeasureStatus, Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

interface CastingRow {
  id: string;
  cast_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
}

const toCasting = (c: CastingRow): Casting => ({
  id: c.id,
  castId: c.cast_id,
  roleId: c.role_id,
  performerId: c.performer_id,
  assignment: c.assignment,
});

export function RoleCastPanel({
  productionId,
  role,
  roles,
  setRoles,
  casts,
  selectedCastId,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
}: {
  productionId: string;
  role: Role;
  roles: Role[];
  setRoles: Dispatch<SetStateAction<Role[]>>;
  casts: Cast[];
  selectedCastId: string;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  const statusOf = (performerId: string): MeasureStatus => measurementStatus[performerId] ?? "none";

  const summaries = performerRoleSummaries(performers, castings, roles, casts);
  const candidatesFor = (query: string) =>
    pickerCandidates(query, performers, castings, { castId: selectedCastId, roleId: role.id }).map((p) => ({
      id: p.id,
      name: p.name,
      summary: summaries[p.id] ?? "",
    }));

  async function addCastMember(who: { name: string } | { performerId: string }, assignment: Assignment) {
    if (!selectedCastId) return;
    if ("name" in who && !who.name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ castId: selectedCastId, roleId: role.id, assignment, ...who }),
    });
    if (res.ok) {
      const { performer, casting } = (await res.json()) as {
        performer: { id: string; label: string };
        casting: CastingRow;
      };
      // A reused performer is already in state — only append genuinely new ones.
      setPerformers((prev) =>
        prev.some((p) => p.id === performer.id) ? prev : [...prev, { id: performer.id, name: performer.label }],
      );
      setCastings((prev) => [...prev, toCasting(casting)]);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCasting(casting: Casting) {
    const who = nameOf(casting.performerId) || "this cast member";
    const message = isLastCasting(casting.performerId, casting.id, castings)
      ? `Remove ${who}? This is their only role, so their measurements will be deleted too.`
      : `Remove ${who} from ${role.name}?`;
    if (!confirm(message)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings/${casting.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      const { performerDeleted } = (await res.json()) as { performerDeleted: boolean };
      setCastings((prev) => prev.filter((c) => c.id !== casting.id));
      if (performerDeleted) setPerformers((prev) => prev.filter((p) => p.id !== casting.performerId));
    } else {
      setError("Couldn't remove cast member");
    }
    setBusy(false);
  }

  async function toggleEnsemble(next: boolean) {
    const count = castings.filter((c) => c.roleId === role.id).length;
    if (count > 0) {
      const noun = count === 1 ? "member" : "members";
      const message = next
        ? `${count} cast ${noun} will become ensemble ${noun}.`
        : "The first-added member in each cast becomes primary; the rest become understudies.";
      if (!confirm(message)) return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles/${role.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isEnsemble: next }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update role");
      setBusy(false);
      return;
    }
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, isEnsemble: next } : r)));
    // Assignments were converted server-side — pull the fresh castings.
    const list = await fetch(`/api/productions/${productionId}/castings`, { credentials: "include" });
    if (list.ok) {
      const { castings: rows } = (await list.json()) as { castings: CastingRow[] };
      setCastings(rows.map(toCasting));
    } else {
      setError("Role updated — reload the page to see the new cast layout.");
    }
    setBusy(false);
  }

  async function renamePerformer(performerId: string, label: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/performers/${performerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setPerformers((prev) => prev.map((p) => (p.id === performerId ? { ...p, name: label } : p)));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't rename cast member");
    }
    setBusy(false);
  }

  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const understudies = forRole.filter((c) => c.assignment === "understudy");
  const ensemble = forRole.filter((c) => c.assignment === "ensemble");

  const link = (c: Casting, order?: number) => (
    <CastLink
      key={c.id}
      order={order}
      productionId={productionId}
      performerId={c.performerId}
      name={nameOf(c.performerId)}
      status={statusOf(c.performerId)}
      onRemove={() => removeCasting(c)}
      onRename={(label) => renamePerformer(c.performerId, label)}
      busy={busy}
    />
  );

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={role.isEnsemble}
          disabled={busy}
          onChange={(e) => toggleEnsemble(e.target.checked)}
        />
        Ensemble role <span className="muted">(no primary or understudies)</span>
      </label>

      {role.isEnsemble ? (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="lbl">Ensemble</span>
            <PerformerPicker
              placeholder="Add performer"
              block
              busy={busy}
              candidates={candidatesFor}
              onAddNew={(name) => addCastMember({ name }, "ensemble")}
              onPickExisting={(performerId) => addCastMember({ performerId }, "ensemble")}
            />
          </div>
          <div className="flex flex-col items-start gap-1">{ensemble.map((c) => link(c))}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {primary ? (
              link(primary)
            ) : (
              <PerformerPicker
                placeholder="Add primary"
                busy={busy}
                candidates={candidatesFor}
                onAddNew={(name) => addCastMember({ name }, "primary")}
                onPickExisting={(performerId) => addCastMember({ performerId }, "primary")}
              />
            )}
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="lbl">Understudies</span>
              <PerformerPicker
                placeholder="Add understudy"
                addLabel="Add"
                block
                busy={busy}
                candidates={candidatesFor}
                onAddNew={(name) => addCastMember({ name }, "understudy")}
                onPickExisting={(performerId) => addCastMember({ performerId }, "understudy")}
              />
            </div>
            <div className="flex flex-col items-start gap-1">{understudies.map((u, i) => link(u, i + 1))}</div>
          </div>
        </>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire Workspace → RoleCard → RoleCastPanel**

In `RoleCard.tsx` add `roles,` to the destructured props and `roles: Role[];` to the prop types. In the `activeTab === "cast"` branch, add to `<RoleCastPanel …>`:
```tsx
              roles={roles}
              setRoles={setRoles}
              casts={casts}
```
In `ProductionWorkspace.tsx`, in the `sortedRoles.map((r) => <RoleCard …/>)` render, add `roles={roles}`.

- [ ] **Step 4: Costume panel includes ensemble members**

`src/components/RoleCostumePanel.tsx` lines 261-262 become:
```ts
  const primary = forRole.find((c) => c.assignment === "primary");
  const ordered = [
    ...(primary ? [primary] : []),
    ...forRole.filter((c) => c.assignment === "understudy"),
    ...forRole.filter((c) => c.assignment === "ensemble"),
  ];
```
(The `· Understudy` label stays conditional on `"understudy"`, so ensemble members get no label.)

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → clean. `npx vitest run` → green. `npx eslint src/components/RoleCastPanel.tsx src/components/PerformerPicker.tsx src/components/RoleCard.tsx src/components/RoleCostumePanel.tsx` → clean.

```bash
git add src/components/PerformerPicker.tsx src/components/RoleCastPanel.tsx src/components/RoleCard.tsx src/components/RoleCostumePanel.tsx src/components/ProductionWorkspace.tsx
git commit -m "feat(ensemble): cast panel ensemble toggle/list, reuse-existing-performer picker, per-role removal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Performer measurement page header + User Guide

**Files:**
- Modify: `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx`
- Modify: `src/app/(app)/guide/page.tsx` (Roles, casts & performers section)

**Interfaces:**
- Consumes: `Casting.assignment` incl. `ensemble` (Task 1/3).

- [ ] **Step 1: Header lists every casting**

In the performer page, replace

```ts
  const performer = performers.find((p) => p.id === performerId);
  const casting = castings.find((c) => c.performer_id === performerId);
  const role = casting ? roles.find((r) => r.id === casting.role_id) : undefined;
  const cast = casting ? casts.find((c) => c.id === casting.cast_id) : undefined;
```

with

```ts
  const performer = performers.find((p) => p.id === performerId);
  // One performer can be cast in several roles/casts; they share this one set of measurements.
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));
  const appearances = castings
    .filter((c) => c.performer_id === performerId)
    .map((c) => ({
      id: c.id,
      role: roleName.get(c.role_id) ?? "Role",
      cast: casts.length > 1 ? castName.get(c.cast_id) ?? null : null,
      tag: c.assignment === "understudy" ? "Understudy" : c.assignment === "ensemble" ? "Ensemble" : null,
    }));
```

and replace the header `<div className="mt-2 mb-6">…</div>` with:

```tsx
      <div className="mt-2 mb-6">
        <p className="text-sm muted">{production.title}</p>
        <h1 className="font-display text-3xl font-semibold">{performer?.label ?? "Measurements"}</h1>
        {appearances.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-base">
            {appearances.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.role}</span>
                <span className="muted">
                  {a.cast ? ` · ${a.cast}` : ""}
                  {a.tag ? ` · ${a.tag}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
```

- [ ] **Step 2: Guide copy**

In `src/app/(app)/guide/page.tsx`, the **Performers & measurements** `<LI>` becomes:

```tsx
            <LI><B>Performers &amp; measurements</B> — assign a performer to each role, as primary or
              understudy, and record their measurements. Height is entered and shown in feet and inches.
              When adding someone, pick an <I>existing performer</I> from the list to cast them in another
              role — their measurements carry over, so you only take them once.</LI>
            <LI><B>Ensemble roles</B> — tick <B>Ensemble</B> when adding a role (or on its Cast &amp; Measure
              tab) for groups like &ldquo;Villagers&rdquo;: no primary or understudies, just a list of
              performers who each need a costume.</LI>
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → clean; `npx eslint "src/app/(app)/productions/[id]/performers/[performerId]/page.tsx" "src/app/(app)/guide/page.tsx"` → clean.

```bash
git add "src/app/(app)/productions/[id]/performers/[performerId]/page.tsx" "src/app/(app)/guide/page.tsx"
git commit -m "feat(ensemble): performer page lists all roles; guide covers ensemble + reuse

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification

- [ ] **Step 1:** `npx tsc --noEmit` → no output.
- [ ] **Step 2:** `npx vitest run` → all files pass; record the counts.
- [ ] **Step 3:** `npx eslint src` → no errors in touched files.
- [ ] **Step 4:** `grep -rn '"primary" | "understudy"' src --include='*.ts' --include='*.tsx'` → expect no matches; change any straggler to `Assignment` from `@/lib/casting-assignment`.
- [ ] **Step 5: Browser check.** Migration 0030 is NOT applied, so ensemble features will error against the live DB — do not apply it. Report to Chris that a browser pass needs 0030 applied first (it's additive and safe to apply ahead of deploy), then run through: add an ensemble role; add 2 new + 1 existing performer (confirm the existing one's measurement dot matches); toggle ensemble→regular→ensemble with people cast; remove a multi-role performer (stays) and a single-role performer (confirm copy mentions measurements); check Costume tab, Costume Creations, performer page header.
