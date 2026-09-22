# Combine Duplicate Performers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user combine same-name performers in a production into one person with one measurement set, so measurements taken under one role show under every role that person holds.

**Architecture:** A pure module groups performers by the import's normalized name key and picks the kept row; a Postgres function moves castings, fills the kept row's missing measurements, and deletes the duplicates in one transaction; a route recomputes the groups from fresh data before running anything; a review panel in the production workspace lists the groups and submits the selected ones.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres via `supabaseAdmin`), Vitest (node environment, mocked data layer), Tailwind classes from `globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-22-combine-duplicate-performers-design.md`

## Global Constraints

- No `any`. `@typescript-eslint/no-explicit-any` is a lint error and a red build.
- NO EM-DASHES anywhere: code, comments, copy, SQL comments, docs. Use a comma, period, colon, or "and".
- Before every commit, grep every file you wrote (not the diff) for the em-dash character (U+2014, bytes e2 80 94): `grep -n $'\xe2\x80\x94' <each file>` must print nothing.
- Read `node_modules/next/dist/docs/` before writing route or page code; this is Next.js 16 and dynamic `params` is a Promise.
- Migrations are applied by Chris through the Supabase dashboard SQL editor, never by the implementer. The migration task ends with the file committed and a verification query written for him.
- Name matching is `matchKey` from `src/lib/cast-import/normalize.ts`. Never add fuzzy matching.
- The kept row's measurement values always win; only its blanks are filled.
- Tests use the repo's `vi.mock` patterns (see `src/lib/data/castings.test.ts` and `src/app/api/productions/[id]/castings/route.test.ts`). Run a single file with `npx vitest run <path>`; run everything with `npm test`.
- Commit after each task with a conventional message and the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0036_combine_performers.sql` | Transactional `combine_performers` function, service-role only |
| `src/lib/performer-duplicates.ts` | Pure, client-safe: grouping, kept-row choice, collision detection, request parsing and matching, request building, note wording |
| `src/lib/performer-duplicates.test.ts` | Tests for the pure module |
| `src/lib/data/performer-duplicates.ts` | Server: load groups from the database, call the RPC, map RPC errors |
| `src/lib/data/performer-duplicates.test.ts` | Tests for the data module |
| `src/app/api/productions/[id]/performers/combine/route.ts` | `POST`: guard, parse, recompute, run per group, return snapshot |
| `src/app/api/productions/[id]/performers/combine/route.test.ts` | Route tests |
| `src/components/CombineDuplicatesPanel.tsx` | Review panel (client component) |
| `src/components/ProductionWorkspace.tsx` | New `filledCounts` prop, derived groups, notice line, panel slot, note |
| `src/app/(app)/productions/[id]/page.tsx` | Pass `filledCounts` |
| `src/app/(app)/guide/page.tsx` | One guide item |

---

### Task 1: Migration 0036, `combine_performers`

**Files:**
- Create: `supabase/migrations/0036_combine_performers.sql`

**Interfaces:**
- Produces: Postgres function `combine_performers(p_production_id uuid, p_keep uuid, p_drop uuid[]) returns jsonb` with keys `castings_moved`, `measurements_filled`, `performers_removed`. Raises errcode `P0002` when any id is outside the production or the arguments are malformed, and lets a castings unique violation (`23505`) propagate unchanged.

- [ ] **Step 1: Read the two existing function migrations for the house style**

Read `supabase/migrations/0033_ensemble_roles.sql` and the last 15 lines of `supabase/migrations/0035_cast_import_hardening.sql`. Note: `language plpgsql`, `set search_path = public`, and the `revoke ... grant ... to service_role` tail.

- [ ] **Step 2: Write the migration**

```sql
-- Combine same-name performers in a production into one person (see the 2026-09-22 spec).
-- Before 2026-09-15 every cast add created a new performer, so one person cast in three roles
-- became three rows with three measurement sets. This moves every casting from the dropped rows
-- onto the kept row, fills the kept row's missing measurements from the dropped rows, and deletes
-- the dropped rows, all in one transaction.
--
-- Rules:
--   * The kept row's measurement values always win. Only keys it lacks are filled.
--   * Among dropped rows holding the same key, the earliest updated_at wins.
--   * Costume pieces reference castings by id, so they move with the casting untouched.
--   * A casting unique violation (the kept row already holds that cast + role) aborts the call
--     with SQLSTATE 23505; the caller maps it to a user-facing conflict.
--   * Any id outside the production aborts with SQLSTATE P0002 before anything is written.
create or replace function combine_performers(p_production_id uuid, p_keep uuid, p_drop uuid[])
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n_expected int;
  n_found int;
  n_castings int := 0;
  n_measurements int := 0;
  n_performers int := 0;
begin
  n_expected := coalesce(array_length(p_drop, 1), 0);
  if n_expected = 0 then
    raise exception 'combine_scope: nothing to drop' using errcode = 'P0002';
  end if;
  if p_keep = any(p_drop) then
    raise exception 'combine_scope: kept performer is also listed to drop' using errcode = 'P0002';
  end if;
  if not exists (select 1 from performers where id = p_keep and production_id = p_production_id) then
    raise exception 'combine_scope: kept performer is not in this production' using errcode = 'P0002';
  end if;
  select count(distinct id) into n_found
  from performers
  where production_id = p_production_id and id = any(p_drop);
  if n_found <> n_expected then
    raise exception 'combine_scope: a dropped performer is not in this production' using errcode = 'P0002';
  end if;

  -- Move every casting. castings_cast_role_performer_key raises 23505 on a collision.
  update castings set performer_id = p_keep where performer_id = any(p_drop);
  get diagnostics n_castings = row_count;

  -- Fill only what the kept row lacks. One row per key from the dropped set, earliest wins.
  insert into performer_measurements (performer_id, measurement_key, value_numeric, value_text, unit, updated_at)
  select p_keep, d.measurement_key, d.value_numeric, d.value_text, d.unit, d.updated_at
  from (
    select distinct on (m.measurement_key) m.*
    from performer_measurements m
    where m.performer_id = any(p_drop)
    order by m.measurement_key, m.updated_at asc, m.id asc
  ) d
  on conflict (performer_id, measurement_key) do nothing;
  get diagnostics n_measurements = row_count;

  -- Their remaining measurements cascade with the row.
  delete from performers where id = any(p_drop);
  get diagnostics n_performers = row_count;

  return jsonb_build_object(
    'castings_moved', n_castings,
    'measurements_filled', n_measurements,
    'performers_removed', n_performers
  );
end;
$$;

-- Only the service role (supabaseAdmin) may call it.
revoke execute on function combine_performers(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function combine_performers(uuid, uuid, uuid[]) to service_role;
```

- [ ] **Step 3: Confirm the `performer_measurements` columns the insert names exist**

Run: `grep -n "value_text\|value_numeric" supabase/migrations/0002_performers.sql supabase/migrations/0024_additional_measurements.sql`
Expected: `value_numeric` in 0002, `value_text` added in 0024. If 0024 also made `value_numeric` nullable, nothing changes; the insert copies both columns as they are.

- [ ] **Step 4: Write the verification query for Chris into the migration file's header comment**

Append this comment block at the very top of the file, above the first comment:

```sql
-- Verify after applying (dashboard SQL editor, per the home CLAUDE.md use pg_proc, not information_schema):
--   set role postgres;
--   select p.proname,
--          has_function_privilege('service_role', p.oid, 'execute') as service_role,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('anon', p.oid, 'execute') as anon
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'combine_performers';
-- Expected: one row, service_role true, authenticated false, anon false.
```

- [ ] **Step 5: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' supabase/migrations/0036_combine_performers.sql`
Expected: no output.

```bash
git add supabase/migrations/0036_combine_performers.sql
git commit -m "feat(performers): migration 0036, combine_performers transactional function

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Report to the plan owner: migration 0036 is written and NOT applied. Chris applies it in the Supabase SQL editor and runs the verification query in the file header.

---

### Task 2: Pure module, grouping and kept-row choice

**Files:**
- Create: `src/lib/performer-duplicates.ts`
- Create: `src/lib/performer-duplicates.test.ts`

**Interfaces:**
- Consumes: `matchKey` from `src/lib/cast-import/normalize.ts`; `Assignment` from `src/lib/casting-assignment.ts`.
- Produces:

```ts
export interface DuplicateMember {
  performerId: string;
  name: string;
  filledMeasurements: number;
  castings: { castingId: string; castId: string; roleId: string; assignment: Assignment }[];
}
export interface DuplicateGroup {
  key: string;
  keepId: string;
  members: DuplicateMember[];   // kept member first
  blocked: { reason: "collision"; castId: string; roleId: string } | null;
}
export interface DuplicateInput {
  performers: { id: string; name: string }[];
  castings: { id: string; castId: string; roleId: string; performerId: string; assignment: Assignment }[];
  filledCounts: Record<string, number>;
}
export function findDuplicateGroups(input: DuplicateInput): DuplicateGroup[];
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/performer-duplicates.test.ts
import { expect, test } from "vitest";
import { findDuplicateGroups } from "@/lib/performer-duplicates";

const casting = (id: string, performerId: string, roleId: string, castId = "ct1", assignment: "primary" | "understudy" | "ensemble" = "primary") =>
  ({ id, castId, roleId, performerId, assignment }) as const;

test("groups performers whose names match under matchKey and drops singletons", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Sarah Lee" },
      { id: "p2", name: "sarah  lee" },
      { id: "p3", name: "Bert" },
      { id: "p4", name: "O'Brien" },
      { id: "p5", name: "OBrien" },
    ],
    castings: [casting("c1", "p1", "r1"), casting("c2", "p2", "r2"), casting("c3", "p3", "r3"), casting("c4", "p4", "r4"), casting("c5", "p5", "r5")],
    filledCounts: {},
  });
  expect(groups.map((g) => g.members.map((m) => m.performerId))).toEqual([
    ["p4", "p5"],
    ["p1", "p2"],
  ]);
  expect(groups[1].key).toBe("sarah lee");
});

test("keeps the member with the most filled measurements, then the smallest id", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p9", name: "Ava" },
      { id: "p2", name: "Ava" },
      { id: "p5", name: "Ava" },
    ],
    castings: [casting("c1", "p9", "r1"), casting("c2", "p2", "r2"), casting("c3", "p5", "r3")],
    filledCounts: { p9: 3, p2: 7, p5: 7 },
  });
  expect(groups).toHaveLength(1);
  expect(groups[0].keepId).toBe("p2");
  expect(groups[0].members.map((m) => m.performerId)).toEqual(["p2", "p5", "p9"]);
  expect(groups[0].members[0].filledMeasurements).toBe(7);
});

test("attaches each member's castings", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1"), casting("c2", "p2", "r2", "ct1", "ensemble"), casting("c3", "p2", "r3", "ct2", "understudy")],
    filledCounts: {},
  });
  expect(groups[0].members[1].castings).toEqual([
    { castingId: "c2", castId: "ct1", roleId: "r2", assignment: "ensemble" },
    { castingId: "c3", castId: "ct2", roleId: "r3", assignment: "understudy" },
  ]);
});

test("blocks a group when two members share a cast and role", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1", "ct1", "ensemble"), casting("c2", "p2", "r1", "ct1", "ensemble")],
    filledCounts: {},
  });
  expect(groups[0].blocked).toEqual({ reason: "collision", castId: "ct1", roleId: "r1" });
});

test("the same role in different casts is not a collision", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1", "ct1"), casting("c2", "p2", "r1", "ct2")],
    filledCounts: {},
  });
  expect(groups[0].blocked).toBeNull();
});

test("sorts groups by kept name, case-insensitive", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "zed" },
      { id: "p2", name: "Zed" },
      { id: "p3", name: "Amy" },
      { id: "p4", name: "amy" },
    ],
    castings: [],
    filledCounts: {},
  });
  expect(groups.map((g) => g.members[0].name)).toEqual(["Amy", "zed"]);
});

test("ignores performers whose name normalizes to nothing", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "  " },
      { id: "p2", name: "." },
    ],
    castings: [],
    filledCounts: {},
  });
  expect(groups).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/performer-duplicates.test.ts`
Expected: FAIL, cannot resolve `@/lib/performer-duplicates`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/performer-duplicates.ts
// Client-safe (no server imports). Shared by the production page, the combine route, and the
// review panel so all three see the same groups and the same kept row.
import { matchKey } from "@/lib/cast-import/normalize";
import type { Assignment } from "@/lib/casting-assignment";

export interface DuplicateMember {
  performerId: string;
  name: string;
  filledMeasurements: number;
  castings: { castingId: string; castId: string; roleId: string; assignment: Assignment }[];
}

export interface DuplicateGroup {
  key: string;
  keepId: string;
  members: DuplicateMember[];
  blocked: { reason: "collision"; castId: string; roleId: string } | null;
}

export interface DuplicateInput {
  performers: { id: string; name: string }[];
  castings: { id: string; castId: string; roleId: string; performerId: string; assignment: Assignment }[];
  filledCounts: Record<string, number>;
}

// Kept row: most filled measurements, then the smallest id. No creation time on purpose: the
// client does not hold it for rows added this session, and both sides must rank identically.
function compareKeepPriority(a: DuplicateMember, b: DuplicateMember): number {
  if (b.filledMeasurements !== a.filledMeasurements) return b.filledMeasurements - a.filledMeasurements;
  return a.performerId < b.performerId ? -1 : a.performerId > b.performerId ? 1 : 0;
}

// Two members in the same cast and role cannot be merged: castings are unique per
// (cast, role, performer), so moving one onto the other would violate that key.
function findCollision(members: DuplicateMember[]): DuplicateGroup["blocked"] {
  const seen = new Set<string>();
  for (const m of members) {
    for (const c of m.castings) {
      const slot = `${c.castId}:${c.roleId}`;
      if (seen.has(slot)) return { reason: "collision", castId: c.castId, roleId: c.roleId };
      seen.add(slot);
    }
  }
  return null;
}

export function findDuplicateGroups(input: DuplicateInput): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateMember[]>();
  for (const p of input.performers) {
    const key = matchKey(p.name);
    if (!key) continue;
    const member: DuplicateMember = {
      performerId: p.id,
      name: p.name,
      filledMeasurements: input.filledCounts[p.id] ?? 0,
      castings: input.castings
        .filter((c) => c.performerId === p.id)
        .map((c) => ({ castingId: c.id, castId: c.castId, roleId: c.roleId, assignment: c.assignment })),
    };
    const list = byKey.get(key) ?? [];
    list.push(member);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const ordered = [...members].sort(compareKeepPriority);
    groups.push({ key, keepId: ordered[0].performerId, members: ordered, blocked: findCollision(ordered) });
  }
  groups.sort((a, b) => a.members[0].name.localeCompare(b.members[0].name, undefined, { sensitivity: "base" }));
  return groups;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/performer-duplicates.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' src/lib/performer-duplicates.ts src/lib/performer-duplicates.test.ts`
Expected: no output.

```bash
git add src/lib/performer-duplicates.ts src/lib/performer-duplicates.test.ts
git commit -m "feat(performers): group same-name performers and choose the kept row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Pure module, request parsing, matching, request building, note wording

**Files:**
- Modify: `src/lib/performer-duplicates.ts` (append)
- Modify: `src/lib/performer-duplicates.test.ts` (append)

**Interfaces:**
- Consumes: `DuplicateGroup` from Task 2; `ValidationError` from `src/lib/errors.ts`.
- Produces:

```ts
export const MAX_COMBINE_GROUPS = 200;
export const CAST_LIST_CHANGED = "The cast list changed. Reload and review again.";
export const COMBINE_COLLISION = "Same person is cast twice in one role. Remove one casting first.";
export interface CombineRequestGroup { performerIds: string[] }
export interface CombineCounts { groups: number; castingsMoved: number; measurementsFilled: number; performersRemoved: number }
export function parseCombineBody(body: unknown): CombineRequestGroup[];              // throws ValidationError
export function matchRequestedGroups(requested: CombineRequestGroup[], computed: DuplicateGroup[]): DuplicateGroup[] | null;
export function toCombineRequest(groups: DuplicateGroup[], selectedKeys: ReadonlySet<string>): CombineRequestGroup[];
export function describeCombineCounts(counts: CombineCounts): string;
```

- [ ] **Step 1: Append the failing tests**

```ts
// append to src/lib/performer-duplicates.test.ts
import { ValidationError } from "@/lib/errors";
import {
  parseCombineBody,
  matchRequestedGroups,
  toCombineRequest,
  describeCombineCounts,
  MAX_COMBINE_GROUPS,
  type DuplicateGroup,
} from "@/lib/performer-duplicates";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const member = (performerId: string, filled = 0) => ({ performerId, name: "Ava", filledMeasurements: filled, castings: [] });
const group = (key: string, ids: string[], blocked: DuplicateGroup["blocked"] = null): DuplicateGroup => ({
  key,
  keepId: ids[0],
  members: ids.map((id) => member(id)),
  blocked,
});

test("parseCombineBody accepts well-formed groups of uuids", () => {
  expect(parseCombineBody({ groups: [{ performerIds: [A, B] }] })).toEqual([{ performerIds: [A, B] }]);
});

test.each([
  ["not an object", "x"],
  ["groups missing", {}],
  ["group not an object", { groups: ["x"] }],
  ["ids not an array", { groups: [{ performerIds: A }] }],
  ["fewer than two ids", { groups: [{ performerIds: [A] }] }],
  ["non-uuid id", { groups: [{ performerIds: [A, "nope"] }] }],
  ["repeated id inside a group", { groups: [{ performerIds: [A, A] }] }],
  ["no groups", { groups: [] }],
])("parseCombineBody rejects %s", (_label, body) => {
  expect(() => parseCombineBody(body)).toThrow(ValidationError);
});

test("parseCombineBody rejects more than MAX_COMBINE_GROUPS groups", () => {
  const groups = Array.from({ length: MAX_COMBINE_GROUPS + 1 }, () => ({ performerIds: [A, B] }));
  expect(() => parseCombineBody({ groups })).toThrow(ValidationError);
});

test("matchRequestedGroups returns the computed groups in request order when every set matches", () => {
  const computed = [group("ava", [A, B]), group("bo", [C, A])];
  const matched = matchRequestedGroups([{ performerIds: [A, C] }, { performerIds: [B, A] }], computed);
  expect(matched?.map((g) => g.key)).toEqual(["bo", "ava"]);
});

test.each([
  ["an id set that matches no group", [{ performerIds: [A, C] }], [group("ava", [A, B])]],
  ["a partial set", [{ performerIds: [A, B] }], [group("ava", [A, B, C])]],
  ["a blocked group", [{ performerIds: [A, B] }], [group("ava", [A, B], { reason: "collision", castId: "ct", roleId: "r" })]],
  ["the same group twice", [{ performerIds: [A, B] }, { performerIds: [B, A] }], [group("ava", [A, B])]],
])("matchRequestedGroups returns null for %s", (_label, requested, computed) => {
  expect(matchRequestedGroups(requested, computed)).toBeNull();
});

test("toCombineRequest sends only selected, unblocked groups with every member id", () => {
  const groups = [
    group("ava", [A, B]),
    group("bo", [C, A], { reason: "collision", castId: "ct", roleId: "r" }),
    group("cy", [B, C]),
  ];
  expect(toCombineRequest(groups, new Set(["ava", "bo"]))).toEqual([{ performerIds: [A, B] }]);
});

test("describeCombineCounts pluralizes", () => {
  expect(describeCombineCounts({ groups: 1, castingsMoved: 2, measurementsFilled: 1, performersRemoved: 1 })).toBe(
    "Combined 1 name; 1 measurement carried over.",
  );
  expect(describeCombineCounts({ groups: 3, castingsMoved: 9, measurementsFilled: 0, performersRemoved: 6 })).toBe(
    "Combined 3 names; 0 measurements carried over.",
  );
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/lib/performer-duplicates.test.ts`
Expected: the seven Task 2 tests pass; the new ones fail with "is not a function" or missing export.

- [ ] **Step 3: Append the implementation**

```ts
// append to src/lib/performer-duplicates.ts
import { ValidationError } from "@/lib/errors";

export const MAX_COMBINE_GROUPS = 200;
export const CAST_LIST_CHANGED = "The cast list changed. Reload and review again.";
export const COMBINE_COLLISION = "Same person is cast twice in one role. Remove one casting first.";

export interface CombineRequestGroup {
  performerIds: string[];
}

export interface CombineCounts {
  groups: number;
  castingsMoved: number;
  measurementsFilled: number;
  performersRemoved: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID = "Invalid request. Reload and try again.";

// Shape-check an untrusted body. Whether the ids form a real group is matchRequestedGroups' job.
export function parseCombineBody(body: unknown): CombineRequestGroup[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ValidationError(INVALID);
  const groups = (body as { groups?: unknown }).groups;
  if (!Array.isArray(groups) || groups.length === 0) throw new ValidationError(INVALID);
  if (groups.length > MAX_COMBINE_GROUPS) {
    throw new ValidationError(`Combine at most ${MAX_COMBINE_GROUPS} names at a time.`);
  }
  return groups.map((raw): CombineRequestGroup => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError(INVALID);
    const ids = (raw as { performerIds?: unknown }).performerIds;
    if (!Array.isArray(ids) || ids.length < 2) throw new ValidationError(INVALID);
    const performerIds = ids.map((id) => {
      if (typeof id !== "string" || !UUID.test(id)) throw new ValidationError(INVALID);
      return id;
    });
    if (new Set(performerIds).size !== performerIds.length) throw new ValidationError(INVALID);
    return { performerIds };
  });
}

function setKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

// Every requested id set must be exactly one computed, unblocked group, and no group twice.
// Returns the computed groups in request order, or null when anything does not line up.
export function matchRequestedGroups(
  requested: CombineRequestGroup[],
  computed: DuplicateGroup[],
): DuplicateGroup[] | null {
  const byMembers = new Map(computed.map((g) => [setKey(g.members.map((m) => m.performerId)), g]));
  const used = new Set<string>();
  const matched: DuplicateGroup[] = [];
  for (const r of requested) {
    const key = setKey(r.performerIds);
    const g = byMembers.get(key);
    if (!g || g.blocked || used.has(key)) return null;
    used.add(key);
    matched.push(g);
  }
  return matched;
}

// What the review panel submits: the selected, unblocked groups, each as its full member set.
export function toCombineRequest(groups: DuplicateGroup[], selectedKeys: ReadonlySet<string>): CombineRequestGroup[] {
  return groups
    .filter((g) => selectedKeys.has(g.key) && !g.blocked)
    .map((g) => ({ performerIds: g.members.map((m) => m.performerId) }));
}

export function describeCombineCounts(counts: CombineCounts): string {
  const names = counts.groups === 1 ? "1 name" : `${counts.groups} names`;
  const filled = counts.measurementsFilled === 1 ? "1 measurement" : `${counts.measurementsFilled} measurements`;
  return `Combined ${names}; ${filled} carried over.`;
}
```

Move the `ValidationError` import to the top of the file with the other imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/performer-duplicates.test.ts`
Expected: all passed.

- [ ] **Step 5: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' src/lib/performer-duplicates.ts src/lib/performer-duplicates.test.ts`
Expected: no output.

```bash
git add src/lib/performer-duplicates.ts src/lib/performer-duplicates.test.ts
git commit -m "feat(performers): parse, match and build combine requests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Data module, load groups and call the RPC

**Files:**
- Create: `src/lib/data/performer-duplicates.ts`
- Create: `src/lib/data/performer-duplicates.test.ts`

**Interfaces:**
- Consumes: `listPerformers`, `getFilledMeasurementCounts` from `src/lib/data/performers.ts`; `listCastings` from `src/lib/data/castings.ts`; `supabaseAdmin.rpc`; `findDuplicateGroups`, `CAST_LIST_CHANGED`, `COMBINE_COLLISION` from Task 2 and 3; `ConflictError` from `src/lib/errors.ts`.
- Produces:

```ts
export interface RpcCombineCounts { castings_moved: number; measurements_filled: number; performers_removed: number }
export async function loadDuplicateGroups(productionId: string): Promise<DuplicateGroup[]>;
export async function combinePerformers(productionId: string, keepId: string, dropIds: string[]): Promise<RpcCombineCounts>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/data/performer-duplicates.test.ts
import { expect, test, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

const rpc = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));

const listPerformers = vi.fn();
const getFilledMeasurementCounts = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  listPerformers: (...a: unknown[]) => listPerformers(...a),
  getFilledMeasurementCounts: (...a: unknown[]) => getFilledMeasurementCounts(...a),
}));

const listCastings = vi.fn();
vi.mock("@/lib/data/castings", () => ({ listCastings: (...a: unknown[]) => listCastings(...a) }));

import { loadDuplicateGroups, combinePerformers } from "@/lib/data/performer-duplicates";

beforeEach(() => {
  [rpc, listPerformers, getFilledMeasurementCounts, listCastings].forEach((m) => m.mockReset());
});

test("loadDuplicateGroups maps rows into the pure function and returns its groups", async () => {
  listPerformers.mockResolvedValue([
    { id: "p1", production_id: "prod", label: "Ava", notes: null, created_at: "2026-01-01" },
    { id: "p2", production_id: "prod", label: "ava", notes: null, created_at: "2026-01-02" },
  ]);
  listCastings.mockResolvedValue([
    { id: "c1", production_id: "prod", cast_id: "ct1", role_id: "r1", performer_id: "p1", assignment: "primary", created_at: "" },
    { id: "c2", production_id: "prod", cast_id: "ct1", role_id: "r2", performer_id: "p2", assignment: "ensemble", created_at: "" },
  ]);
  getFilledMeasurementCounts.mockResolvedValue({ p2: 4 });

  const groups = await loadDuplicateGroups("prod");

  expect(listPerformers).toHaveBeenCalledWith("prod");
  expect(listCastings).toHaveBeenCalledWith("prod");
  expect(getFilledMeasurementCounts).toHaveBeenCalledWith(["p1", "p2"]);
  expect(groups).toHaveLength(1);
  expect(groups[0].keepId).toBe("p2");
  expect(groups[0].members[1].castings).toEqual([{ castingId: "c1", castId: "ct1", roleId: "r1", assignment: "primary" }]);
});

test("combinePerformers calls the RPC with the production, kept id and dropped ids", async () => {
  rpc.mockResolvedValue({ data: { castings_moved: 2, measurements_filled: 3, performers_removed: 2 }, error: null });
  const counts = await combinePerformers("prod", "p1", ["p2", "p3"]);
  expect(rpc).toHaveBeenCalledWith("combine_performers", { p_production_id: "prod", p_keep: "p1", p_drop: ["p2", "p3"] });
  expect(counts).toEqual({ castings_moved: 2, measurements_filled: 3, performers_removed: 2 });
});

test("combinePerformers maps a castings unique violation to the collision conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow(
    new ConflictError("Same person is cast twice in one role. Remove one casting first."),
  );
});

test("combinePerformers maps a scope failure to the cast-list-changed conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "combine_scope: a dropped performer is not in this production" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow(
    new ConflictError("The cast list changed. Reload and review again."),
  );
});

test("combinePerformers rethrows other errors as plain errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow("boom");
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.not.toBeInstanceOf(ConflictError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/performer-duplicates.test.ts`
Expected: FAIL, cannot resolve `@/lib/data/performer-duplicates`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/data/performer-duplicates.ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ConflictError } from "@/lib/errors";
import { listPerformers, getFilledMeasurementCounts } from "@/lib/data/performers";
import { listCastings } from "@/lib/data/castings";
import {
  findDuplicateGroups,
  CAST_LIST_CHANGED,
  COMBINE_COLLISION,
  type DuplicateGroup,
} from "@/lib/performer-duplicates";

export interface RpcCombineCounts {
  castings_moved: number;
  measurements_filled: number;
  performers_removed: number;
}

// Same-name performers in a production, computed from fresh rows.
export async function loadDuplicateGroups(productionId: string): Promise<DuplicateGroup[]> {
  const [performers, castings] = await Promise.all([listPerformers(productionId), listCastings(productionId)]);
  const filledCounts = await getFilledMeasurementCounts(performers.map((p) => p.id));
  return findDuplicateGroups({
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    castings: castings.map((c) => ({
      id: c.id,
      castId: c.cast_id,
      roleId: c.role_id,
      performerId: c.performer_id,
      assignment: c.assignment,
    })),
    filledCounts,
  });
}

// One transaction via combine_performers (migration 0036). Callers pass a group that
// matchRequestedGroups already validated against fresh data.
export async function combinePerformers(
  productionId: string,
  keepId: string,
  dropIds: string[],
): Promise<RpcCombineCounts> {
  const { data, error } = await supabaseAdmin.rpc("combine_performers", {
    p_production_id: productionId,
    p_keep: keepId,
    p_drop: dropIds,
  });
  if (error) {
    // 23505: the kept row already holds one of the moved cast + role slots.
    if (error.code === "23505") throw new ConflictError(COMBINE_COLLISION);
    // P0002: an id fell outside the production between the recompute and the call.
    if (error.code === "P0002") throw new ConflictError(CAST_LIST_CHANGED);
    throw new Error(error.message);
  }
  return data as RpcCombineCounts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/performer-duplicates.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' src/lib/data/performer-duplicates.ts src/lib/data/performer-duplicates.test.ts`
Expected: no output.

```bash
git add src/lib/data/performer-duplicates.ts src/lib/data/performer-duplicates.test.ts
git commit -m "feat(performers): load duplicate groups and call combine_performers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Route, `POST /api/productions/[id]/performers/combine`

**Files:**
- Create: `src/app/api/productions/[id]/performers/combine/route.ts`
- Create: `src/app/api/productions/[id]/performers/combine/route.test.ts`

**Interfaces:**
- Consumes: `getAuthContext` (`src/lib/auth-context.ts`), `errorResponse` (`src/lib/api.ts`), `assertProductionInOrg` (`src/lib/data/production-access.ts`), `loadWorkspaceSnapshot` (`src/lib/data/cast-import.ts`), Task 3 and Task 4 exports.
- Produces: `POST` returning `200 { counts: CombineCounts, workspace: WorkspaceSnapshot }`, `409 { error, completed }` when a group fails mid-run, `409 { error }` when the request does not match fresh data, `400` on a malformed body, `404` outside the org.

- [ ] **Step 1: Read the Next.js 16 route handler doc**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (or the closest `route` file under that tree; `ls node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`). Confirm `params` is a Promise and is awaited.

- [ ] **Step 2: Write the failing tests**

```ts
// src/app/api/productions/[id]/performers/combine/route.test.ts
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

const loadDuplicateGroups = vi.fn();
const combinePerformers = vi.fn();
vi.mock("@/lib/data/performer-duplicates", () => ({
  loadDuplicateGroups: (...a: unknown[]) => loadDuplicateGroups(...a),
  combinePerformers: (...a: unknown[]) => combinePerformers(...a),
}));

const loadWorkspaceSnapshot = vi.fn();
vi.mock("@/lib/data/cast-import", () => ({
  loadWorkspaceSnapshot: (...a: unknown[]) => loadWorkspaceSnapshot(...a),
}));

import { NotFoundError, ConflictError } from "@/lib/errors";
import { POST } from "@/app/api/productions/[id]/performers/combine/route";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

const member = (performerId: string) => ({ performerId, name: "Ava", filledMeasurements: 0, castings: [] });
const group = (key: string, ids: string[]) => ({ key, keepId: ids[0], members: ids.map(member), blocked: null });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadDuplicateGroups, combinePerformers, loadWorkspaceSnapshot].forEach((m) =>
    m.mockReset(),
  );
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  loadDuplicateGroups.mockResolvedValue([group("ava", [A, B]), group("bo", [C, D])]);
  combinePerformers.mockResolvedValue({ castings_moved: 1, measurements_filled: 2, performers_removed: 1 });
  loadWorkspaceSnapshot.mockResolvedValue({ casts: [], roles: [], performers: [], castings: [] });
});

test("POST combines each matched group in request order and returns counts plus the snapshot", async () => {
  const res = await POST(req({ groups: [{ performerIds: [D, C] }, { performerIds: [A, B] }] }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(combinePerformers).toHaveBeenNthCalledWith(1, "p1", C, [D]);
  expect(combinePerformers).toHaveBeenNthCalledWith(2, "p1", A, [B]);
  expect(loadWorkspaceSnapshot).toHaveBeenCalledWith("p1");
  await expect(res.json()).resolves.toEqual({
    counts: { groups: 2, castingsMoved: 2, measurementsFilled: 4, performersRemoved: 2 },
    workspace: { casts: [], roles: [], performers: [], castings: [] },
  });
});

test("POST 404 when the production is not in the org", async () => {
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ groups: [{ performerIds: [A, B] }] }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST 400 on a malformed body", async () => {
  const res = await POST(req({ groups: [{ performerIds: [A] }] }), ctx("p1"));
  expect(res.status).toBe(400);
  expect(loadDuplicateGroups).not.toHaveBeenCalled();
});

test("POST 409 when a requested set is not a current group, and runs nothing", async () => {
  const res = await POST(req({ groups: [{ performerIds: [A, C] }] }), ctx("p1"));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: "The cast list changed. Reload and review again." });
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST 409 for a blocked group", async () => {
  loadDuplicateGroups.mockResolvedValue([{ ...group("ava", [A, B]), blocked: { reason: "collision", castId: "ct", roleId: "r" } }]);
  const res = await POST(req({ groups: [{ performerIds: [A, B] }] }), ctx("p1"));
  expect(res.status).toBe(409);
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST stops at the first failing group and reports how many completed", async () => {
  combinePerformers
    .mockResolvedValueOnce({ castings_moved: 1, measurements_filled: 0, performers_removed: 1 })
    .mockRejectedValueOnce(new ConflictError("Same person is cast twice in one role. Remove one casting first."));
  const res = await POST(req({ groups: [{ performerIds: [A, B] }, { performerIds: [C, D] }] }), ctx("p1"));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({
    error: "Same person is cast twice in one role. Remove one casting first.",
    completed: 1,
  });
  expect(combinePerformers).toHaveBeenCalledTimes(2);
  expect(loadWorkspaceSnapshot).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/productions/[id]/performers/combine/route.test.ts"`
Expected: FAIL, cannot resolve the route module.

- [ ] **Step 4: Write the route**

```ts
// src/app/api/productions/[id]/performers/combine/route.ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ConflictError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadDuplicateGroups, combinePerformers } from "@/lib/data/performer-duplicates";
import { loadWorkspaceSnapshot } from "@/lib/data/cast-import";
import {
  parseCombineBody,
  matchRequestedGroups,
  CAST_LIST_CHANGED,
  type CombineCounts,
} from "@/lib/performer-duplicates";

type Ctx = { params: Promise<{ id: string }> };

// Combine same-name performers. The request names member sets; the server recomputes the groups
// from fresh rows and only runs sets that match a current, unblocked group exactly, so a stale
// review or a forged id can never merge two different people or a row from another production.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const requested = parseCombineBody(await request.json());

    const groups = matchRequestedGroups(requested, await loadDuplicateGroups(id));
    if (!groups) throw new ConflictError(CAST_LIST_CHANGED);

    const counts: CombineCounts = { groups: 0, castingsMoved: 0, measurementsFilled: 0, performersRemoved: 0 };
    for (const g of groups) {
      const dropIds = g.members.filter((m) => m.performerId !== g.keepId).map((m) => m.performerId);
      try {
        const r = await combinePerformers(id, g.keepId, dropIds);
        counts.groups += 1;
        counts.castingsMoved += r.castings_moved;
        counts.measurementsFilled += r.measurements_filled;
        counts.performersRemoved += r.performers_removed;
      } catch (err) {
        // Groups already combined stay combined; tell the client how far it got.
        if (err instanceof ConflictError) {
          return NextResponse.json({ error: err.message, completed: counts.groups }, { status: 409 });
        }
        throw err;
      }
    }

    const workspace = await loadWorkspaceSnapshot(id);
    return NextResponse.json({ counts, workspace });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/productions/[id]/performers/combine/route.test.ts"`
Expected: 6 passed.

- [ ] **Step 6: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' "src/app/api/productions/[id]/performers/combine/route.ts" "src/app/api/productions/[id]/performers/combine/route.test.ts"`
Expected: no output.

```bash
git add "src/app/api/productions/[id]/performers/combine/route.ts" "src/app/api/productions/[id]/performers/combine/route.test.ts"
git commit -m "feat(performers): POST combine route with fresh-data matching

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Review panel component

**Files:**
- Create: `src/components/CombineDuplicatesPanel.tsx`

**Interfaces:**
- Consumes: `DuplicateGroup`, `CombineCounts`, `toCombineRequest` from Task 2 and 3; `assignmentShortTag` from `src/lib/casting-assignment.ts`; `WorkspaceSnapshot` type from `src/lib/cast-import/types.ts`.
- Produces:

```tsx
export function CombineDuplicatesPanel(props: {
  productionId: string;
  groups: DuplicateGroup[];
  roles: { id: string; name: string }[];
  casts: { id: string; name: string }[];
  measurementStatus: Record<string, "none" | "partial" | "complete">;
  onCombined: (workspace: WorkspaceSnapshot, counts: CombineCounts) => void;
  onClose: () => void;
}): JSX.Element
```

No unit test: the Vitest environment is node with no DOM, matching the rest of `src/components`. The request-building logic it uses was tested in Task 3; the component is exercised in Task 8's browser pass.

- [ ] **Step 1: Read `src/components/cast-import/CastImportPanel.tsx` for the panel shell and the fetch and error pattern**

Note the `surface space-y-4 p-5` section, the header row with a Close link, `btn-primary`, `link-muted`, the `text-[var(--red)]` error line, and the 5xx "may have finished" wording.

- [ ] **Step 2: Write the component**

```tsx
// src/components/CombineDuplicatesPanel.tsx
"use client";

import { useState } from "react";
import { assignmentShortTag } from "@/lib/casting-assignment";
import { toCombineRequest, type CombineCounts, type DuplicateGroup } from "@/lib/performer-duplicates";
import type { WorkspaceSnapshot } from "@/lib/cast-import/types";

type MeasureStatus = "none" | "partial" | "complete";

const COMBINE_FAILED = "Couldn't combine right now. Try again.";
const COMBINE_MAYBE_DONE = "The combine may have finished. Reload the page to check before trying again.";

// Review same-name performers and combine the selected groups into one person each.
export function CombineDuplicatesPanel({
  productionId,
  groups,
  roles,
  casts,
  measurementStatus,
  onCombined,
  onClose,
}: {
  productionId: string;
  groups: DuplicateGroup[];
  roles: { id: string; name: string }[];
  casts: { id: string; name: string }[];
  measurementStatus: Record<string, MeasureStatus>;
  onCombined: (workspace: WorkspaceSnapshot, counts: CombineCounts) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.filter((g) => !g.blocked).map((g) => g.key)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "Role";
  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "Cast";
  const showCast = casts.length > 1;
  const request = toCombineRequest(groups, selected);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function combine() {
    if (request.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/performers/combine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groups: request }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        counts?: CombineCounts;
        workspace?: WorkspaceSnapshot;
        error?: string;
      };
      if (res.ok && data.counts && data.workspace) {
        onCombined(data.workspace, data.counts); // the parent closes this panel
        return;
      }
      // A 5xx may mean some groups committed before the response failed; a 4xx is a clean
      // rejection whose message says what to do.
      setError(res.status >= 500 ? COMBINE_MAYBE_DONE : (data.error ?? COMBINE_FAILED));
    } catch {
      setError(COMBINE_MAYBE_DONE);
    }
    setBusy(false);
  }

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Combine duplicates</h2>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Close
        </button>
      </div>
      <p className="text-sm muted">
        Each name below was added more than once. Combining keeps one entry per name, moves every
        role onto it, and carries the measurements over. The kept entry&rsquo;s measurements win;
        blanks are filled from the others.
      </p>

      <ul className="space-y-3">
        {groups.map((g) => {
          const checked = selected.has(g.key) && !g.blocked;
          return (
            <li key={g.key} className={`space-y-1 rounded-xl border border-[var(--field-line)] p-3 ${g.blocked ? "opacity-60" : ""}`}>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy || g.blocked !== null}
                  onChange={() => toggle(g.key)}
                  aria-label={`Combine ${g.members[0].name}`}
                />
                <span className="min-w-0 break-words">{g.members[0].name}</span>
              </label>
              <ul className="space-y-0.5 pl-6 text-sm">
                {g.members.map((m) => (
                  <li key={m.performerId} className="flex flex-wrap items-center gap-x-2">
                    <span className="min-w-0 break-words">
                      {m.castings.length === 0
                        ? "No roles"
                        : m.castings
                            .map((c) => `${roleName(c.roleId)}${showCast ? ` · ${castName(c.castId)}` : ""}${assignmentShortTag(c.assignment)}`)
                            .join(", ")}
                    </span>
                    <span className="muted">
                      {measurementStatus[m.performerId] === "complete"
                        ? "measured"
                        : measurementStatus[m.performerId] === "partial"
                          ? "partly measured"
                          : "not measured"}
                    </span>
                    {m.performerId === g.keepId && <span className="chip text-xs">Kept</span>}
                  </li>
                ))}
              </ul>
              {g.blocked && (
                <p className="pl-6 text-xs muted">
                  Cast twice as {roleName(g.blocked.roleId)}
                  {showCast ? ` in ${castName(g.blocked.castId)}` : ""}. Remove one casting first.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={combine} disabled={busy || request.length === 0} className="btn-primary">
          {busy ? "Combining…" : `Combine selected (${request.length})`}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Cancel
        </button>
      </div>

      {error && <p className="text-[var(--red)]">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit && echo OK`
Expected: `OK`. If `chip` or `btn-primary` are flagged nowhere (they are CSS classes, not types), ignore; if a type error names this file, fix it here.

- [ ] **Step 4: Em-dash check and commit**

Run: `grep -n $'\xe2\x80\x94' src/components/CombineDuplicatesPanel.tsx`
Expected: no output. (The middle dot `·` and the ellipsis `…` are allowed and already used by the cast panel.)

```bash
git add src/components/CombineDuplicatesPanel.tsx
git commit -m "feat(performers): combine duplicates review panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Wire the workspace, the page, and the guide

**Files:**
- Modify: `src/components/ProductionWorkspace.tsx` (imports at lines 1-21, props at lines 33-60, state near line 96, render near lines 309-330, and the roles-present branch near line 350)
- Modify: `src/app/(app)/productions/[id]/page.tsx` (around lines 62-70 and 136-150)
- Modify: `src/app/(app)/guide/page.tsx` (the `<UL>` ending near line 89)

**Interfaces:**
- Consumes: `CombineDuplicatesPanel` (Task 6); `findDuplicateGroups`, `describeCombineCounts`, `CombineCounts` (Task 2 and 3).
- Produces: `ProductionWorkspace` prop `filledCounts: Record<string, number>`.

- [ ] **Step 1: Add the prop and the derived groups to `ProductionWorkspace`**

Add to the imports:

```ts
import { useMemo, useState } from "react";   // replace the existing `import { useState } from "react";`
import { CombineDuplicatesPanel } from "@/components/CombineDuplicatesPanel";
import { findDuplicateGroups, describeCombineCounts, type CombineCounts } from "@/lib/performer-duplicates";
```

Add `filledCounts` to the destructured props and the props type, directly after `measurementStatus`:

```ts
  measurementStatus,
  filledCounts,
```
```ts
  measurementStatus: Record<string, MeasureStatus>;
  filledCounts: Record<string, number>;
```

Directly after the `importNote` state line (`const [importNote, setImportNote] = useState<string | null>(null);`), add:

```ts
  const [showCombine, setShowCombine] = useState(false);
  // Same-name performers, kept live from workspace state so the notice follows renames,
  // adds, removals, imports and combines without a reload.
  const duplicateGroups = useMemo(
    () => findDuplicateGroups({ performers, castings, filledCounts }),
    [performers, castings, filledCounts],
  );

  // A finished combine replaces the cast-list state with fresh server data, like an import.
  function applyCombine(workspace: WorkspaceSnapshot, counts: CombineCounts) {
    setCasts(workspace.casts);
    setRoles(workspace.roles);
    setPerformers(workspace.performers);
    setCastings(workspace.castings);
    if (!workspace.casts.some((c) => c.id === selectedCastId)) setSelectedCastId(workspace.casts[0]?.id ?? "");
    setShowCombine(false);
    setImportNote(describeCombineCounts(counts));
  }
```

`performers` and `castings` are the existing `useState` values declared above; `filledCounts` is the new prop. If `findDuplicateGroups` complains about the `castings` element type, the workspace `Casting` interface already has `id, castId, roleId, performerId, assignment`, which is the required shape; check the `Assignment` import is the one from `@/lib/casting-assignment`.

- [ ] **Step 2: Render the notice and the panel**

Directly after the existing `{importNote && ( ... )}` block and before `{showImport && (`, add:

```tsx
      {duplicateGroups.length > 0 && !showCombine && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {duplicateGroups.length === 1 ? "1 name appears" : `${duplicateGroups.length} names appear`} more than
            once.
          </span>
          <button
            type="button"
            onClick={() => {
              setShowImport(false);
              setShowCombine(true);
            }}
            className="link-red"
          >
            Combine duplicates
          </button>
        </p>
      )}
      {showCombine && (
        <CombineDuplicatesPanel
          productionId={productionId}
          groups={duplicateGroups}
          roles={roles}
          casts={casts}
          measurementStatus={measurementStatus}
          onCombined={applyCombine}
          onClose={() => setShowCombine(false)}
        />
      )}
```

Then make opening the import panel close the combine panel. Both existing `setShowImport(true)` calls (the "import a cast list" link in the empty state and the "Import cast list" link in the list header) become:

```tsx
onClick={() => {
  setShowCombine(false);
  setShowImport(true);
}}
```

- [ ] **Step 3: Pass `filledCounts` from the page**

In `src/app/(app)/productions/[id]/page.tsx`, `filledCounts` already exists (`const filledCounts = await getFilledMeasurementCounts(...)`). Add one prop to the `<ProductionWorkspace ... />` element, directly after `measurementStatus={measurementStatus}`:

```tsx
        filledCounts={filledCounts}
```

- [ ] **Step 4: Add the guide item**

In `src/app/(app)/guide/page.tsx`, after the `<LI><B>Ensemble roles</B> ...</LI>` item and before the closing `</UL>` of the "Roles, casts & performers" section, add:

```tsx
            <LI><B>Combine duplicates</B>: if the same person was added under several roles as separate
              entries, the cast list offers <I>Combine duplicates</I>. It keeps one entry per name, moves
              every role onto it, and carries the measurements over, so you only take them once.</LI>
```

Neighboring items in this file use a different separator after the bold label. Do not copy it; the
colon is the required form. Never add an em-dash to any file.

- [ ] **Step 5: Type-check, lint, and run the whole suite**

Run: `npx tsc --noEmit && echo OK`
Expected: `OK`.

Run: `npm run lint`
Expected: no errors.

Run: `npm test`
Expected: all green, including the previously passing suites.

- [ ] **Step 6: Em-dash check on the files this task wrote, then commit**

Run: `grep -n $'\xe2\x80\x94' src/components/ProductionWorkspace.tsx src/components/CombineDuplicatesPanel.tsx "src/app/(app)/productions/[id]/page.tsx"`
Expected: no output.

Run: `git diff "src/app/(app)/guide/page.tsx" | grep '^+' | grep -n $'\xe2\x80\x94'`
Expected: no output. The guide page has pre-existing dashes in lines this task does not touch; only the added lines are checked.

```bash
git add src/components/ProductionWorkspace.tsx "src/app/(app)/productions/[id]/page.tsx" "src/app/(app)/guide/page.tsx"
git commit -m "feat(performers): combine-duplicates notice, panel slot, and guide item

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Verification pass

**Files:**
- No new files. Reads everything above.

- [ ] **Step 1: Confirm migration 0036 is applied before any browser test**

Ask Chris whether 0036 has been applied and the verification query in the file header returned `service_role true, authenticated false, anon false`. Without it the combine route returns a 500 from the missing function. Do not proceed to Step 3 until he confirms.

- [ ] **Step 2: Full checks**

Run: `npx tsc --noEmit && echo OK`
Run: `npm run lint`
Run: `npm test`
Run: `grep -rn $'\xe2\x80\x94' supabase/migrations/0036_combine_performers.sql src/lib/performer-duplicates.ts src/lib/performer-duplicates.test.ts src/lib/data/performer-duplicates.ts src/lib/data/performer-duplicates.test.ts "src/app/api/productions/[id]/performers/combine" src/components/CombineDuplicatesPanel.tsx`
Expected: `OK`, no lint errors, all tests green, no grep output.

- [ ] **Step 3: Browser pass on a seeded production shaped like Nada's**

Start the app: `npm run dev` (port 6100; check `~/projects/PORTS.md` first). Sign in to a test org. Then:

1. Create a production "Combine QA". Add roles: "Molly" (regular), "Orphans" (ensemble), "Sailors" (ensemble).
2. Cast "Sarah Lee" as primary of Molly by typing the name and pressing Enter. On Orphans, add a new person named "Sarah Lee 2" (a distinct name, so the picker does not offer the existing row), then use the rename control on that row to rename it to "Sarah Lee". Repeat on Sailors with "Sarah Lee 3". There are now three separate "Sarah Lee" rows, which is exactly how the pre-2026-09-15 build left Nada's data.
3. Open the Molly row's Sarah Lee measurement page and fill Height, Chest, Waist. Go back.
4. Confirm the notice "1 name appears more than once. Combine duplicates" shows above the roles list.
5. Click it. Confirm the panel lists Sarah Lee with three lines: Molly (measured, Kept), Orphans · ens (not measured), Sailors · ens (not measured).
6. Click "Combine selected (1)". Confirm the panel closes, the note reads "Combined 1 name; 0 measurements carried over." and the notice is gone.
7. Open the Sarah Lee link from each of the three roles. Confirm all three open the same measurement page, headed by all three roles, with Height, Chest, and Waist present.
8. Blocked case: on Orphans add "Sam Cole" and then "Sam Cole 2", and rename the second to "Sam Cole", so two different rows of that name sit in the same role and cast. Confirm the notice appears, the panel shows the group unchecked and disabled with "Cast twice as Orphans. Remove one casting first.", and "Combine selected (0)" is disabled. Remove one Sam Cole from Orphans and confirm the notice disappears (one row of that name remains).
9. Phone width: at 390px the panel has a 16px gutter and no horizontal scroll.

Record what you saw for each step in the task report. Delete the "Combine QA" production afterward.

- [ ] **Step 4: Report**

The report lists: tests run and their counts, the browser steps and their outcomes, and the reminder that Nada runs "Combine duplicates" once on "Peter and the Starcatcher" after deploy (expected result: 14 names combined, measurements carried over for the 6 duplicated measured rows).
