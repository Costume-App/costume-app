# Maker↔User Link + My Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionally link a maker to a Clerk org member, surface a personal "My Work" page of the logged-in user's assigned pieces, and let admins pull org members into the maker roster.

**Architecture:** A nullable `makers.clerk_user_id` (migration 0019) is the only schema change; member names/emails are resolved live from Clerk, never duplicated. A pure `buildMakerAssignments` assembles the My-Work rows (unit-tested like `tailor-summary.ts`); a thin data fetch feeds it. A lightweight `PATCH /api/pieces/[pieceId] { made }` toggles "done" without the heavy piece upsert.

**Tech Stack:** Next.js 16 App Router, Supabase (`supabaseAdmin`), Clerk `@clerk/nextjs` ^7 (`clerkClient`, `OrganizationSwitcher` already in use), TypeScript strict, Vitest.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/0019_makers_user_link.sql` | **new** — `clerk_user_id` column + partial unique index |
| `src/lib/data/makers.ts` | add `clerk_user_id`; create/update accept `clerkUserId`; `findMakerByUser` |
| `src/lib/data/makers.test.ts` | extend for the above |
| `src/app/api/makers/route.ts` | POST accepts `clerkUserId` |
| `src/app/api/makers/[makerId]/route.ts` | PATCH accepts `clerkUserId` (string\|null) |
| `src/app/api/makers/[makerId]/route.test.ts` | extend for `clerkUserId` |
| `src/lib/data/org-members.ts` | **new** — `listOrgMembers(orgId)` via Clerk |
| `src/app/api/org/members/route.ts` | **new** — `GET` org members |
| `src/app/api/org/members/route.test.ts` | **new** |
| `src/lib/maker-assignments.ts` | **new** — pure `buildMakerAssignments` + types |
| `src/lib/maker-assignments.test.ts` | **new** |
| `src/lib/data/maker-assignments.ts` | **new** — `listAssignmentsForMaker` (thin fetch → builder) |
| `src/lib/data/costume-pieces.ts` | add `setPieceMade` |
| `src/lib/data/costume-pieces.test.ts` | extend for `setPieceMade` |
| `src/app/api/pieces/[pieceId]/route.ts` | **new** — `PATCH { made }` |
| `src/app/api/pieces/[pieceId]/route.test.ts` | **new** |
| `src/components/MakersManager.tsx` | member fetch + per-row link/unlink + "not yet makers" section |
| `src/components/MyWorkList.tsx` | **new** — client list with done toggle |
| `src/app/my-work/page.tsx` | **new** — My Work page |
| `src/app/productions/page.tsx` | add "My Work" nav link |

UI components have no test infra in this repo — verified via `tsc`/`lint`/browser. Everything else is TDD.

---

## Task 1: Migration 0019

**Files:**
- Create: `supabase/migrations/0019_makers_user_link.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0019_makers_user_link.sql`:

```sql
-- Optionally link a maker to a Clerk user (org member). Nullable so free-add
-- makers keep working; partial unique index = at most one maker per user per org.
alter table makers add column clerk_user_id text;

create unique index makers_org_user_unique
  on makers (org_id, clerk_user_id)
  where clerk_user_id is not null;
```

- [ ] **Step 2: Commit** (the shared Supabase project applies it separately)

```bash
git add supabase/migrations/0019_makers_user_link.sql
git commit -m "feat: migration 0019 — makers.clerk_user_id link"
```

---

## Task 2: makers data layer — link fields + findMakerByUser

**Files:**
- Modify: `src/lib/data/makers.ts`
- Test: `src/lib/data/makers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/makers.test.ts` (before the final blank line). It needs a `maybeSingle` resolver on the *list-style* select chain for `findMakerByUser`; add a dedicated mock and wire it:

```ts
test("createMaker passes clerk_user_id through when given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m9", org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" }, error: null });
  await createMaker("org_1", { name: "Jo", clerkUserId: "user_1" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" });
});

test("createMaker omits clerk_user_id when not given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m10" }, error: null });
  await createMaker("org_1", { name: "Kim" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Kim", color: "slate" });
});

test("updateMaker sets clerk_user_id (link) and clears it (unlink)", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
  await updateMaker("org_1", "m1", { clerkUserId: "user_2" });
  expect(update).toHaveBeenCalledWith({ clerk_user_id: "user_2" });
  await updateMaker("org_1", "m1", { clerkUserId: null });
  expect(update).toHaveBeenCalledWith({ clerk_user_id: null });
});

test("findMakerByUser returns the matching maker or null", async () => {
  const fbuMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "m1", org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" }, error: null });
  const fbuEqUser = vi.fn(() => ({ maybeSingle: fbuMaybeSingle }));
  const fbuEqOrg = vi.fn(() => ({ eq: fbuEqUser }));
  select.mockReturnValueOnce({ eq: fbuEqOrg });
  const maker = await findMakerByUser("org_1", "user_1");
  expect(fbuEqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(fbuEqUser).toHaveBeenCalledWith("clerk_user_id", "user_1");
  expect(maker?.id).toBe("m1");

  fbuMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  select.mockReturnValueOnce({ eq: fbuEqOrg });
  expect(await findMakerByUser("org_1", "nobody")).toBeNull();
});
```

Update the import line at the top of the test file from:
```ts
import { listMakers, createMaker, updateMaker, deleteMaker } from "@/lib/data/makers";
```
to:
```ts
import { listMakers, createMaker, updateMaker, deleteMaker, findMakerByUser } from "@/lib/data/makers";
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/data/makers.test.ts`
Expected: FAIL — `findMakerByUser` not exported; `clerkUserId` not handled.

- [ ] **Step 3: Implement**

In `src/lib/data/makers.ts`:

(3a) Add `clerk_user_id` to the interface:
```ts
export interface Maker {
  id: string;
  org_id: string;
  name: string;
  color: string;
  clerk_user_id: string | null;
  created_at: string;
}
```

(3b) Replace `createMaker` with:
```ts
export async function createMaker(
  orgId: string,
  input: { name: string; color?: string; clerkUserId?: string | null },
): Promise<Maker> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Maker name is required");
  const row: Record<string, unknown> = { org_id: orgId, name, color: input.color ?? "slate" };
  if (input.clerkUserId !== undefined) row.clerk_user_id = input.clerkUserId;
  const { data, error } = await supabaseAdmin.from("makers").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as Maker;
}
```

(3c) In `updateMaker`, widen the patch type and add the field. Replace the signature + body up to the supabase call with:
```ts
export async function updateMaker(
  orgId: string,
  id: string,
  patch: { name?: string; color?: string; clerkUserId?: string | null },
): Promise<Maker> {
  const update: { name?: string; color?: string; clerk_user_id?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Maker name is required");
    update.name = trimmed;
  }
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.clerkUserId !== undefined) update.clerk_user_id = patch.clerkUserId;
```
(leave the rest of `updateMaker` — the supabase `.update(update)...` block — unchanged.)

(3d) Add at the end of the file:
```ts
export async function findMakerByUser(orgId: string, userId: string): Promise<Maker | null> {
  const { data, error } = await supabaseAdmin
    .from("makers")
    .select("*")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Maker) ?? null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/data/makers.test.ts`
Expected: PASS (all, including the four new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/makers.ts src/lib/data/makers.test.ts
git commit -m "feat: makers clerk_user_id link + findMakerByUser"
```

---

## Task 3: makers API routes accept clerkUserId

**Files:**
- Modify: `src/app/api/makers/route.ts`, `src/app/api/makers/[makerId]/route.ts`
- Test: `src/app/api/makers/[makerId]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/makers/[makerId]/route.test.ts`:

```ts
test("PATCH passes clerkUserId through (link) and null (unlink)", async () => {
  vi.mocked(updateMaker).mockResolvedValue({ id: "m1", org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1", created_at: "" });
  const link = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ clerkUserId: "user_1" }) }), ctx("m1"));
  expect(link.status).toBe(200);
  expect(updateMaker).toHaveBeenCalledWith("org_1", "m1", { clerkUserId: "user_1" });

  await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ clerkUserId: null }) }), ctx("m1"));
  expect(updateMaker).toHaveBeenCalledWith("org_1", "m1", { clerkUserId: null });
});
```

(The existing test file already mocks `updateMaker` and defines `ctx`; if `ctx` is named differently there, match it. If the existing mock's `updateMaker` return type now lacks `clerk_user_id`/`created_at`, add them as shown.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/makers/[makerId]/route.test.ts"`
Expected: FAIL — `updateMaker` called without `clerkUserId`.

- [ ] **Step 3: Implement**

(3a) In `src/app/api/makers/[makerId]/route.ts`, replace the PATCH body parsing + patch build:
```ts
    const body = (await request.json()) as { name?: string; color?: string; clerkUserId?: string | null };
    const patch: { name?: string; color?: string; clerkUserId?: string | null } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.color === "string") patch.color = body.color;
    if (body.clerkUserId === null || typeof body.clerkUserId === "string") patch.clerkUserId = body.clerkUserId;
    const maker = await updateMaker(orgId, makerId, patch);
```

(3b) In `src/app/api/makers/route.ts` POST, widen the body type and pass `clerkUserId`:
```ts
    const body = (await request.json()) as { name?: string; color?: string; orgName?: string; clerkUserId?: string | null };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const maker = await createMaker(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      color: typeof body.color === "string" ? body.color : undefined,
      clerkUserId: body.clerkUserId === null || typeof body.clerkUserId === "string" ? body.clerkUserId : undefined,
    });
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/makers/[makerId]/route.test.ts" src/app/api/makers/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/makers/route.ts" "src/app/api/makers/[makerId]/route.ts" "src/app/api/makers/[makerId]/route.test.ts"
git commit -m "feat: makers API accepts clerkUserId (link/unlink)"
```

---

## Task 4: Org members data + API

**Files:**
- Create: `src/lib/data/org-members.ts`, `src/app/api/org/members/route.ts`, `src/app/api/org/members/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/org/members/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));

const getOrganizationMembershipList = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ organizations: { getOrganizationMembershipList } })),
}));

import { GET } from "@/app/api/org/members/route";

beforeEach(() => {
  getOrganizationMembershipList.mockReset();
});

test("GET returns mapped org members", async () => {
  getOrganizationMembershipList.mockResolvedValue({
    data: [
      { publicUserData: { userId: "u1", firstName: "Ada", lastName: "Lovelace", identifier: "ada@x.com", imageUrl: "http://img/1" } },
      { publicUserData: { userId: "u2", firstName: null, lastName: null, identifier: "bob@x.com", imageUrl: "http://img/2" } },
    ],
  });
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(getOrganizationMembershipList).toHaveBeenCalledWith({ organizationId: "org_1" });
  expect(body.members).toEqual([
    { userId: "u1", name: "Ada Lovelace", email: "ada@x.com", imageUrl: "http://img/1" },
    { userId: "u2", name: "bob@x.com", email: "bob@x.com", imageUrl: "http://img/2" },
  ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/org/members/route.test.ts`
Expected: FAIL — route module missing.

- [ ] **Step 3: Implement the data helper**

Create `src/lib/data/org-members.ts`:

```ts
import { clerkClient } from "@clerk/nextjs/server";

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
}

// Live list of the org's Clerk members. Names/emails are never stored locally.
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId });
  return (data ?? []).map((m) => {
    const u = m.publicUserData ?? {};
    const userId = (u.userId ?? "") as string;
    const email = (u.identifier ?? "") as string;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || email;
    return { userId, name, email, imageUrl: (u.imageUrl ?? "") as string };
  });
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/api/org/members/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listOrgMembers } from "@/lib/data/org-members";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const members = await listOrgMembers(orgId);
    return NextResponse.json({ members });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/app/api/org/members/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/org-members.ts src/app/api/org/members/route.ts src/app/api/org/members/route.test.ts
git commit -m "feat: GET /api/org/members (Clerk org member list)"
```

---

## Task 5: Pure buildMakerAssignments

**Files:**
- Create: `src/lib/maker-assignments.ts`, `src/lib/maker-assignments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/maker-assignments.test.ts`:

```ts
import { expect, test } from "vitest";
import { buildMakerAssignments } from "@/lib/maker-assignments";

const pieces = [
  { id: "pc1", costume_design_id: "d1", casting_id: "c1", made: false, made_at: null },
  { id: "pc2", costume_design_id: "d2", casting_id: "c2", made: true, made_at: "2026-06-01" },
  { id: "pc3", costume_design_id: "dX", casting_id: "c9", made: false, made_at: null }, // design not in org → dropped
];
const designs = [
  { id: "d1", production_id: "pr1", role_id: "r1", name: "Cloak" },
  { id: "d2", production_id: "pr2", role_id: "r2", name: "Cap" },
  // dX intentionally absent (foreign / out of org)
];
const productions = [
  { id: "pr1", title: "Cinderella" },
  { id: "pr2", title: "Oliver!" },
];
const roles = [
  { id: "r1", name: "Footman" },
  { id: "r2", name: "Dodger" },
];
const castings = [
  { id: "c1", performer_id: "p1" },
  { id: "c2", performer_id: "p2" },
];
const performers = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bea" },
];

test("buildMakerAssignments joins and shapes rows, dropping pieces whose design is absent", () => {
  const rows = buildMakerAssignments({ pieces, designs, productions, roles, castings, performers });
  expect(rows).toEqual([
    { pieceId: "pc1", productionId: "pr1", productionTitle: "Cinderella", roleName: "Footman", performerName: "Ada", designName: "Cloak", made: false, made_at: null },
    { pieceId: "pc2", productionId: "pr2", productionTitle: "Oliver!", roleName: "Dodger", performerName: "Bea", designName: "Cap", made: true, made_at: "2026-06-01" },
  ]);
});

test("buildMakerAssignments sorts by production title then role name", () => {
  const rows = buildMakerAssignments({
    pieces: [
      { id: "z", costume_design_id: "d2", casting_id: "c2", made: false, made_at: null },
      { id: "a", costume_design_id: "d1", casting_id: "c1", made: false, made_at: null },
    ],
    designs, productions, roles, castings, performers,
  });
  expect(rows.map((r) => r.productionTitle)).toEqual(["Cinderella", "Oliver!"]);
});

test("buildMakerAssignments uses fallbacks for missing role/performer/production", () => {
  const rows = buildMakerAssignments({
    pieces: [{ id: "pc1", costume_design_id: "d1", casting_id: "cZ", made: false, made_at: null }],
    designs: [{ id: "d1", production_id: "prZ", role_id: "rZ", name: "Mystery" }],
    productions: [], roles: [], castings: [], performers: [],
  });
  expect(rows).toEqual([
    { pieceId: "pc1", productionId: "prZ", productionTitle: "—", roleName: "—", performerName: "—", designName: "Mystery", made: false, made_at: null },
  ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/maker-assignments.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/maker-assignments.ts`:

```ts
export interface AssignmentPiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  made: boolean;
  made_at: string | null;
}
export interface AssignmentDesign { id: string; production_id: string; role_id: string; name: string }
export interface AssignmentProduction { id: string; title: string }
export interface AssignmentRole { id: string; name: string }
export interface AssignmentCasting { id: string; performer_id: string }
export interface AssignmentPerformer { id: string; name: string }

export interface MakerAssignment {
  pieceId: string;
  productionId: string;
  productionTitle: string;
  roleName: string;
  performerName: string;
  designName: string;
  made: boolean;
  made_at: string | null;
}

export function buildMakerAssignments(input: {
  pieces: AssignmentPiece[];
  designs: AssignmentDesign[];
  productions: AssignmentProduction[];
  roles: AssignmentRole[];
  castings: AssignmentCasting[];
  performers: AssignmentPerformer[];
}): MakerAssignment[] {
  const designById = new Map(input.designs.map((d) => [d.id, d]));
  const prodById = new Map(input.productions.map((p) => [p.id, p]));
  const roleById = new Map(input.roles.map((r) => [r.id, r]));
  const castingById = new Map(input.castings.map((c) => [c.id, c]));
  const performerById = new Map(input.performers.map((p) => [p.id, p]));

  const rows: MakerAssignment[] = [];
  for (const piece of input.pieces) {
    const design = designById.get(piece.costume_design_id);
    if (!design) continue; // design not in the caller's org → drop
    const production = prodById.get(design.production_id);
    const role = roleById.get(design.role_id);
    const casting = castingById.get(piece.casting_id);
    const performer = casting ? performerById.get(casting.performer_id) : undefined;
    rows.push({
      pieceId: piece.id,
      productionId: design.production_id,
      productionTitle: production?.title ?? "—",
      roleName: role?.name ?? "—",
      performerName: performer?.name ?? "—",
      designName: design.name,
      made: piece.made,
      made_at: piece.made_at,
    });
  }
  rows.sort(
    (a, b) =>
      a.productionTitle.localeCompare(b.productionTitle, undefined, { sensitivity: "base" }) ||
      a.roleName.localeCompare(b.roleName, undefined, { sensitivity: "base" }),
  );
  return rows;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/maker-assignments.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/maker-assignments.ts src/lib/maker-assignments.test.ts
git commit -m "feat: pure buildMakerAssignments (My Work row assembly)"
```

---

## Task 6: listAssignmentsForMaker (thin data fetch)

A thin fetch that gathers the six lists (org-scoped via the productions filter) and delegates to `buildMakerAssignments`. Its logic is trivial delegation; correctness of the assembly is covered by Task 5's tests, so no separate unit test (consistent with how `tailor-summary` page fetches are untested while the build functions are).

**Files:**
- Create: `src/lib/data/maker-assignments.ts`

- [ ] **Step 1: Implement**

Create `src/lib/data/maker-assignments.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildMakerAssignments, type MakerAssignment } from "@/lib/maker-assignments";

const ids = <T extends { [k: string]: unknown }>(rows: T[], key: keyof T): string[] =>
  [...new Set(rows.map((r) => r[key] as string).filter(Boolean))];

export async function listAssignmentsForMaker(orgId: string, makerId: string): Promise<MakerAssignment[]> {
  const { data: pieceRows, error: pErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("id, costume_design_id, casting_id, made, made_at")
    .eq("maker_id", makerId);
  if (pErr) throw new Error(pErr.message);
  const pieces = (pieceRows ?? []) as {
    id: string; costume_design_id: string; casting_id: string; made: boolean; made_at: string | null;
  }[];
  if (pieces.length === 0) return [];

  const { data: designRows, error: dErr } = await supabaseAdmin
    .from("costume_designs")
    .select("id, production_id, role_id, name")
    .in("id", ids(pieces, "costume_design_id"));
  if (dErr) throw new Error(dErr.message);
  const designs = (designRows ?? []) as { id: string; production_id: string; role_id: string; name: string }[];

  // Org scoping happens here: only productions in this org survive, and
  // buildMakerAssignments drops pieces whose design's production isn't returned.
  const { data: prodRows, error: prErr } = await supabaseAdmin
    .from("productions")
    .select("id, title")
    .in("id", ids(designs, "production_id"))
    .eq("org_id", orgId);
  if (prErr) throw new Error(prErr.message);
  const productions = (prodRows ?? []) as { id: string; title: string }[];
  const orgProdIds = new Set(productions.map((p) => p.id));
  const orgDesigns = designs.filter((d) => orgProdIds.has(d.production_id));

  const { data: roleRows, error: rErr } = await supabaseAdmin
    .from("roles").select("id, name").in("id", ids(orgDesigns, "role_id"));
  if (rErr) throw new Error(rErr.message);

  const { data: castingRows, error: cErr } = await supabaseAdmin
    .from("castings").select("id, performer_id").in("id", ids(pieces, "casting_id"));
  if (cErr) throw new Error(cErr.message);
  const castings = (castingRows ?? []) as { id: string; performer_id: string }[];

  const { data: performerRows, error: peErr } = await supabaseAdmin
    .from("performers").select("id, name").in("id", ids(castings, "performer_id"));
  if (peErr) throw new Error(peErr.message);

  return buildMakerAssignments({
    pieces,
    designs: orgDesigns,
    productions,
    roles: (roleRows ?? []) as { id: string; name: string }[],
    castings,
    performers: (performerRows ?? []) as { id: string; name: string }[],
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/maker-assignments.ts
git commit -m "feat: listAssignmentsForMaker data fetch (org-scoped)"
```

---

## Task 7: setPieceMade data layer

**Files:**
- Modify: `src/lib/data/costume-pieces.ts`
- Test: `src/lib/data/costume-pieces.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/data/costume-pieces.test.ts` a self-contained block (it builds its own table-dispatching mock so it doesn't disturb existing tests' mocks):

```ts
import { setPieceMade } from "@/lib/data/costume-pieces";
import { NotFoundError } from "@/lib/errors";

test("setPieceMade updates made/made_at after asserting org ownership", async () => {
  const calls: Record<string, unknown>[] = [];
  const piecesUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const piecesUpdate = vi.fn((patch) => { calls.push(patch as Record<string, unknown>); return { eq: piecesUpdateEq }; });
  const fromMock = vi.fn((table: string) => {
    if (table === "costume_pieces") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pc1", costume_design_id: "d1" }, error: null }) }) }),
        update: piecesUpdate,
      };
    }
    if (table === "costume_designs") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { production_id: "pr1" }, error: null }) }) }) };
    }
    // productions
    return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pr1" }, error: null }) }) }) }) };
  });
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  vi.spyOn(supabaseAdmin, "from").mockImplementation(fromMock as never);

  await setPieceMade("org_1", "pc1", true);
  expect(piecesUpdate).toHaveBeenCalledTimes(1);
  expect(calls[0].made).toBe(true);
  expect(calls[0].made_at).not.toBeNull();
  expect(piecesUpdateEq).toHaveBeenCalledWith("id", "pc1");

  vi.restoreAllMocks();
});

test("setPieceMade throws NotFoundError when the production is not in the org", async () => {
  const fromMock = vi.fn((table: string) => {
    if (table === "costume_pieces") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pc1", costume_design_id: "d1" }, error: null }) }) }) };
    }
    if (table === "costume_designs") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { production_id: "pr1" }, error: null }) }) }) };
    }
    return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
  });
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  vi.spyOn(supabaseAdmin, "from").mockImplementation(fromMock as never);
  await expect(setPieceMade("org_1", "pc1", true)).rejects.toBeInstanceOf(NotFoundError);
  vi.restoreAllMocks();
});
```

(If `costume-pieces.test.ts` mocks `supabaseAdmin` with a module factory rather than a real object, instead add these two tests in a NEW file `src/lib/data/set-piece-made.test.ts` with `vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t) => fromMock(t) } }))` and a module-level `let fromMock` reassigned per test. Use whichever matches the existing file; the assertions are identical.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts`
Expected: FAIL — `setPieceMade` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/data/costume-pieces.ts` (it already imports `supabaseAdmin`; add `NotFoundError` to the existing `@/lib/errors` import):

```ts
// Toggle a single piece's made flag, after asserting it belongs to the org
// (piece → costume_design → production.org_id). Used by the My Work page.
export async function setPieceMade(orgId: string, pieceId: string, made: boolean): Promise<void> {
  const { data: piece, error: pErr } = await supabaseAdmin
    .from("costume_pieces").select("id, costume_design_id").eq("id", pieceId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!piece) throw new NotFoundError("Costume piece not found");

  const { data: design, error: dErr } = await supabaseAdmin
    .from("costume_designs").select("production_id").eq("id", (piece as { costume_design_id: string }).costume_design_id).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!design) throw new NotFoundError("Costume piece not found");

  const { data: prod, error: prErr } = await supabaseAdmin
    .from("productions").select("id").eq("id", (design as { production_id: string }).production_id).eq("org_id", orgId).maybeSingle();
  if (prErr) throw new Error(prErr.message);
  if (!prod) throw new NotFoundError("Costume piece not found");

  const { error: uErr } = await supabaseAdmin
    .from("costume_pieces")
    .update({ made, made_at: made ? new Date().toISOString() : null })
    .eq("id", pieceId);
  if (uErr) throw new Error(uErr.message);
}
```

Update the errors import at the top of `costume-pieces.ts` from `import { ValidationError } from "@/lib/errors";` to `import { ValidationError, NotFoundError } from "@/lib/errors";`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/data/costume-pieces.test.ts` (or `src/lib/data/set-piece-made.test.ts` if you used the separate file)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/costume-pieces.ts src/lib/data/*.test.ts
git commit -m "feat: setPieceMade with org ownership check"
```

---

## Task 8: PATCH /api/pieces/[pieceId]

**Files:**
- Create: `src/app/api/pieces/[pieceId]/route.ts`, `src/app/api/pieces/[pieceId]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/pieces/[pieceId]/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/costume-pieces", () => ({ setPieceMade: vi.fn() }));

import { PATCH } from "@/app/api/pieces/[pieceId]/route";
import { setPieceMade } from "@/lib/data/costume-pieces";

const ctx = (pieceId: string) => ({ params: Promise.resolve({ pieceId }) });

beforeEach(() => vi.mocked(setPieceMade).mockReset());

test("PATCH sets made and returns ok", async () => {
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ made: true }) }), ctx("pc1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(setPieceMade).toHaveBeenCalledWith("org_1", "pc1", true);
});

test("PATCH rejects a non-boolean made", async () => {
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ made: "yes" }) }), ctx("pc1"));
  expect(res.status).toBe(400);
  expect(setPieceMade).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/pieces/[pieceId]/route.test.ts"`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement**

Create `src/app/api/pieces/[pieceId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { setPieceMade } from "@/lib/data/costume-pieces";

type Ctx = { params: Promise<{ pieceId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { pieceId } = await params;
    const body = (await request.json()) as { made?: unknown };
    if (typeof body.made !== "boolean") throw new ValidationError("made must be a boolean");
    await setPieceMade(orgId, pieceId, body.made);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

(Confirm `errorResponse` maps `ValidationError` → 400 — it does for the existing pieces route.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/pieces/[pieceId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/pieces/[pieceId]/route.ts" "src/app/api/pieces/[pieceId]/route.test.ts"
git commit -m "feat: PATCH /api/pieces/[pieceId] { made } toggle"
```

---

## Task 9: My Work page + list component

**Files:**
- Create: `src/components/MyWorkList.tsx`, `src/app/my-work/page.tsx`

- [ ] **Step 1: Create the client list component**

Create `src/components/MyWorkList.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { MakerAssignment } from "@/lib/maker-assignments";

export function MyWorkList({ initial }: { initial: MakerAssignment[] }) {
  const [rows, setRows] = useState<MakerAssignment[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(pieceId: string, made: boolean) {
    setBusy(pieceId);
    setRows((prev) => prev.map((r) => (r.pieceId === pieceId ? { ...r, made } : r)));
    const res = await fetch(`/api/pieces/${pieceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ made }),
    }).catch(() => null);
    if (!res || !res.ok) setRows((prev) => prev.map((r) => (r.pieceId === pieceId ? { ...r, made: !made } : r)));
    setBusy(null);
  }

  if (rows.length === 0) return <p className="text-sm muted">Nothing assigned to you yet.</p>;

  // Group by production (rows are already sorted by production then role).
  const groups: { title: string; rows: MakerAssignment[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.title === r.productionTitle) last.rows.push(r);
    else groups.push({ title: r.productionTitle, rows: [r] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <div className="border-b border-[var(--field-line)] pb-1.5">
            <span className="lbl">{g.title}</span>
          </div>
          <ul className="space-y-1.5">
            {g.rows.map((r) => (
              <li key={r.pieceId} className="surface !shadow-none flex items-center gap-3 p-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={r.made}
                  disabled={busy === r.pieceId}
                  onChange={(e) => toggle(r.pieceId, e.target.checked)}
                  aria-label={`Mark ${r.designName} done`}
                />
                <span className={`min-w-0 flex-1 truncate ${r.made ? "line-through muted" : ""}`}>
                  {r.roleName} → {r.performerName} — {r.designName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/my-work/page.tsx`:

```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { findMakerByUser } from "@/lib/data/makers";
import { listAssignmentsForMaker } from "@/lib/data/maker-assignments";
import { MyWorkList } from "@/components/MyWorkList";

export default async function MyWorkPage() {
  const { orgId, userId } = await getAuthContext();
  const maker = await findMakerByUser(orgId, userId);
  const assignments = maker ? await listAssignmentsForMaker(orgId, maker.id) : [];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="font-display text-3xl font-semibold">My Work</h1>
        <p className="mt-1 text-sm muted">Costume pieces assigned to you, across productions.</p>
      </div>
      {!maker ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          You&apos;re not linked to a maker yet. Link yourself from Makers (in the organization menu), or ask an admin.
        </p>
      ) : (
        <MyWorkList initial={assignments} />
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit` (expect clean) and `npm run lint` (no new errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/MyWorkList.tsx src/app/my-work/page.tsx
git commit -m "feat: /my-work page — personal assigned-pieces list with done toggle"
```

---

## Task 10: Maker linking UI in MakersManager

Add member fetching, a per-row link/unlink control, and a "Team members not yet makers" section. Read the current `src/components/MakersManager.tsx` first to match its state/handlers; the additions below assume its existing `makers` state and `patch`/create helpers.

**Files:**
- Modify: `src/components/MakersManager.tsx`

- [ ] **Step 1: Add member state + fetch**

At the top of the component body, add member state and a mount fetch (adjust the existing `MakerRow` type to include `clerk_user_id: string | null`, and ensure the `initialMakers` mapping in callers includes it — see Step 4):

```tsx
type OrgMember = { userId: string; name: string; email: string; imageUrl: string };
// inside the component:
const [members, setMembers] = useState<OrgMember[]>([]);
useEffect(() => {
  let active = true;
  fetch("/api/org/members", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { members: [] }))
    .then((d: { members?: OrgMember[] }) => { if (active) setMembers(d.members ?? []); })
    .catch(() => {});
  return () => { active = false; };
}, []);
```

(Add `useEffect` to the React import.)

- [ ] **Step 2: Add link/unlink + add-member helpers**

```tsx
const memberByUser = new Map(members.map((m) => [m.userId, m]));
const linkedUserIds = new Set(makers.map((mk) => mk.clerk_user_id).filter(Boolean) as string[]);

async function setMakerUser(id: string, clerkUserId: string | null) {
  setMakers((prev) => prev.map((mk) => (mk.id === id ? { ...mk, clerk_user_id: clerkUserId } : mk)));
  await fetch(`/api/makers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ clerkUserId }),
  }).catch(() => {});
}

async function addMemberAsMaker(m: OrgMember) {
  const res = await fetch("/api/makers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: m.name, clerkUserId: m.userId }),
  });
  if (res.ok) {
    const { maker } = (await res.json()) as { maker: { id: string; name: string; color: string; clerk_user_id: string | null } };
    setMakers((prev) => [...prev, maker]);
  }
}
```

- [ ] **Step 3: Render the link control per row + the "not yet makers" section**

In each maker row (next to the name/color controls), add:

```tsx
<select
  className="field !p-1.5 text-sm"
  value={mk.clerk_user_id ?? ""}
  disabled={busy}
  onChange={(e) => setMakerUser(mk.id, e.target.value || null)}
  aria-label="Link maker to member"
>
  <option value="">Not linked</option>
  {mk.clerk_user_id && !memberByUser.has(mk.clerk_user_id) && (
    <option value={mk.clerk_user_id}>Linked user</option>
  )}
  {members.map((m) => (
    <option key={m.userId} value={m.userId}>{m.name}</option>
  ))}
</select>
```

After the makers list, add the pull-sync section:

```tsx
{members.filter((m) => !linkedUserIds.has(m.userId)).length > 0 && (
  <div className="space-y-2 border-t border-[var(--field-line)] pt-3">
    <span className="lbl">Team members not yet makers</span>
    <ul className="space-y-1.5">
      {members.filter((m) => !linkedUserIds.has(m.userId)).map((m) => (
        <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">{m.name}<span className="muted"> · {m.email}</span></span>
          <button type="button" disabled={busy} onClick={() => addMemberAsMaker(m)} className="link-muted shrink-0">
            + Add as maker
          </button>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 4: Thread `clerk_user_id` through the row type and callers**

In `MakersManager.tsx`, widen the local `MakerRow`/maker state type to include `clerk_user_id: string | null`. Then in the two places that build `initialMakers` — `src/app/makers/page.tsx` and `src/components/OrgMakersPanel.tsx` — include it in the mapping:
- `src/app/makers/page.tsx`: change `makers.map((m) => ({ id: m.id, name: m.name, color: m.color }))` to also pass `clerk_user_id: m.clerk_user_id`.
- `src/components/OrgMakersPanel.tsx`: its local `MakerRow` type and the `.map(...)` must include `clerk_user_id` (the `/api/makers` GET returns it once Task 2 lands).

- [ ] **Step 5: Verify typecheck + lint**

Run: `npx tsc --noEmit` (expect clean) and `npm run lint` (no new errors). Then `npx vitest run` (all green — no behavior the existing tests cover changed).

- [ ] **Step 6: Commit**

```bash
git add src/components/MakersManager.tsx src/components/OrgMakersPanel.tsx src/app/makers/page.tsx
git commit -m "feat: link makers to org members + add-member-as-maker in MakersManager"
```

---

## Task 11: "My Work" nav link

**Files:**
- Modify: `src/app/productions/page.tsx`

- [ ] **Step 1: Add the link**

In the productions header's right-hand `<div className="flex items-center gap-2.5">`, add a My Work link before the Inventory link:

```tsx
<Link href="/my-work" className="link-muted text-sm">
  My Work
</Link>
<Link href="/inventory" className="link-muted text-sm">
  Inventory
</Link>
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` (clean), `npm run lint` (no new errors).

```bash
git add src/app/productions/page.tsx
git commit -m "feat: My Work nav link on productions page"
```

---

## Task 12: Manual verification

**Files:** none (Clerk-gated; requires an authenticated browser). Dev server: http://localhost:3000.

- [ ] **Step 1: Migration** — confirm `0019` is applied to the Supabase project (the linked features need the column).
- [ ] **Step 2: Link a maker** — Org menu → Manage → Makers: a maker row's "Link to member" dropdown lists org members; pick one; reload and confirm it persists (badge/selected). Unlink (set "Not linked") persists too.
- [ ] **Step 3: Add member as maker** — a member with no maker appears under "Team members not yet makers"; "+ Add as maker" creates a linked maker that disappears from that list.
- [ ] **Step 4: My Work** — as a user linked to a maker who has assigned pieces (assign via a production's costume tab), open "My Work": pieces show grouped by production; the done checkbox toggles and persists (reload). As an unlinked user, the page shows the "not linked" message.
- [ ] **Step 5: Org scoping** — confirm My Work shows only the active org's pieces; switching orgs changes the list.

---

## Self-Review Notes

- **Spec coverage:** migration 0019 (T1); `clerk_user_id` + create/update + `findMakerByUser` (T2); makers API passthrough (T3); `GET /api/org/members` (T4); assignment assembly (T5 pure + T6 fetch); `setPieceMade` (T7) + `PATCH /api/pieces/[pieceId]` (T8); My Work page (T9); link/unlink + add-member-as-maker UI (T10); nav link (T11). ✓
- **Type consistency:** `clerkUserId` (camel, API/data args) vs `clerk_user_id` (snake, DB/row) used deliberately and consistently; `MakerAssignment` shape defined in T5, consumed by T6/T9; `findMakerByUser`/`listAssignmentsForMaker`/`setPieceMade` signatures match call sites. ✓
- **Permissions:** managing makers/links stays open to any member (no role gate added), per spec.
- **Org scoping** for My Work is enforced in `listAssignmentsForMaker` (productions filtered by `org_id`; builder drops pieces whose design's production wasn't returned) and re-validated in `setPieceMade`.
