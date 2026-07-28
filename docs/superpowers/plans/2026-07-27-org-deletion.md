# Organization Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator a tested, dry-run-by-default way to delete an organization and all its data, so the 30-day deletion promise published in `/privacy` is backed by something real.

**Architecture:** An operator-run `.mjs` script, not a feature. All deletion logic lives in `scripts/lib/org-deletion.mjs` as functions taking a Supabase client as their first argument, so unit tests inject a fake — a `.mjs` script cannot import `src/lib/data/*.ts`, and those modules import `server-only`. A separate TypeScript module fixes the pre-existing image-orphan leak in three ordinary delete routes. A `deletion_log` table records that a request was honored.

**Tech Stack:** Node ESM (`.mjs`, top-level await), Supabase JS (service-role), Stripe SDK, Next.js 16 App Router, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-org-deletion-design.md`

## Global Constraints

- **Order of operations is the design, and reversing it fails silently.** Stripe cancel → collect+delete storage → anonymize feedback → delete unconstrained tables → delete `organizations` → write `deletion_log`. Never reorder these.
- **Dry-run is the default.** The CLI mutates nothing without `--confirm`.
- **Never delete the Stripe customer.** Cancel the subscription only — invoices are the financial records `/privacy` promises to retain. `stripe.customers.del` must not appear anywhere.
- **The script must not delete the Clerk organization.** That stays a manual dashboard step the script prints. Do not add `@clerk/backend` to `scripts/`.
- **Feedback is anonymized, never deleted:** `user_email`, `user_id`, `org_id` → NULL; `message` retained.
- **`anonymizeOrgFeedback` must run before `deleteOrgRows`** — it matches on `org_id`, which nothing else nulls.
- **The four tables the cascade misses** are `fabric_widths`, `fabric_suppliers`, `feedback`, `production_shares`. Three are deleted; `feedback` is anonymized.

  > **Superseded 2026-07-28:** "three are deleted" is no longer quite right for
  > `production_shares`. The whole-branch review ruled that rows where the
  > deleted org is the *recipient* of another org's share must be released
  > (unlinked), not deleted, to avoid destroying that other org's own record —
  > see the shipped `deleteOrgRows` in `scripts/lib/org-deletion.mjs` and the
  > matching note in the design spec. Only the *source*-side rows and the two
  > genuinely unconstrained tables (`fabric_widths`, `fabric_suppliers`) are
  > deleted outright. Left as-is above for history.
- **No new runtime dependencies.** `scripts/lib/org-deletion.mjs` imports nothing but what it is given.
- **This is Next.js 16.** Per `AGENTS.md`, check `node_modules/next/dist/docs/` before assuming older App Router patterns. Nothing here needs a routing change.
- **Do not push and do not deploy.** Local commits only, on branch `feat/org-deletion`, until Chris gives an explicit green light. Migration `0030` is applied to Supabase by Chris by hand — do not attempt to run it.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/data/storage-paths.ts` *(create)* | Collect image storage paths for a production / role / design |
| `src/lib/data/storage-paths.test.ts` *(create)* | Unit tests for the above |
| `src/lib/storage.ts` *(modify)* | `removeImages` must throw on error |
| `src/lib/storage.test.ts` *(modify)* | Cover the new throw |
| `src/app/api/productions/[id]/route.ts` *(modify)* | Remove images before deleting a production |
| `src/app/api/productions/[id]/roles/[roleId]/route.ts` *(modify)* | Same, for a role |
| `src/app/api/productions/[id]/designs/[designId]/route.ts` *(modify)* | Same, for a design |
| `supabase/migrations/0030_org_deletion.sql` *(create)* | `deletion_log`; drop two NOT NULLs on `feedback` |
| `vitest.config.ts` *(modify)* | Widen `include` to pick up `scripts/**/*.test.mjs` |
| `scripts/lib/org-deletion.mjs` *(create)* | The deletion functions, client injected |
| `scripts/lib/org-deletion.test.mjs` *(create)* | Unit tests with a fake client |
| `scripts/delete-org.mjs` *(create)* | CLI: dry-run default, `--confirm`, `--verify` |
| `docs/runbooks/delete-organization.md` *(create)* | Operator procedure |

Task 1 is self-contained and valuable on its own (ordinary deletes stop leaking files). Tasks 2–4 build the deletion path. Task 5 is documentation plus the whole-feature gate.

---

### Task 1: Stop ordinary deletes from orphaning image files

**Files:**
- Create: `src/lib/data/storage-paths.ts`, `src/lib/data/storage-paths.test.ts`
- Modify: `src/lib/storage.ts:31-34`, `src/lib/storage.test.ts`
- Modify: `src/app/api/productions/[id]/route.ts`, `src/app/api/productions/[id]/roles/[roleId]/route.ts`, `src/app/api/productions/[id]/designs/[designId]/route.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin`; `removeImages` from `@/lib/storage`.
- Produces: `listProductionImagePaths(productionId: string): Promise<string[]>`, `listRoleImagePaths(roleId: string): Promise<string[]>`, `listDesignImagePaths(designId: string): Promise<string[]>` from `@/lib/data/storage-paths`. No later task imports these — the `.mjs` script has its own org-scoped equivalents for runtime reasons.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/storage-paths.test.ts`. This follows the mock style already used in `src/lib/data/inventory-item-images.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const inFn = vi.fn();
const eqFn = vi.fn();
const select = vi.fn();
const from = vi.fn((_t: string) => ({ select }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listProductionImagePaths,
  listRoleImagePaths,
  listDesignImagePaths,
} from "@/lib/data/storage-paths";

beforeEach(() => {
  [inFn, eqFn, select, from].forEach((m) => m.mockReset());
  select.mockReturnValue({ in: inFn, eq: eqFn });
  from.mockReturnValue({ select });
});

test("listRoleImagePaths returns the role's storage paths", async () => {
  inFn.mockResolvedValue({ data: [{ storage_path: "p1/r1/a.jpg" }], error: null });
  const paths = await listRoleImagePaths("r1");
  expect(from).toHaveBeenCalledWith("role_images");
  expect(inFn).toHaveBeenCalledWith("role_id", ["r1"]);
  expect(paths).toEqual(["p1/r1/a.jpg"]);
});

test("listDesignImagePaths returns the design's storage paths", async () => {
  inFn.mockResolvedValue({ data: [{ storage_path: "p1/designs/d1/a.jpg" }], error: null });
  const paths = await listDesignImagePaths("d1");
  expect(from).toHaveBeenCalledWith("costume_design_images");
  expect(inFn).toHaveBeenCalledWith("costume_design_id", ["d1"]);
  expect(paths).toEqual(["p1/designs/d1/a.jpg"]);
});

test("listProductionImagePaths gathers both role and design images", async () => {
  eqFn
    .mockResolvedValueOnce({ data: [{ id: "r1" }], error: null })        // roles
    .mockResolvedValueOnce({ data: [{ id: "d1" }], error: null });       // costume_designs
  inFn
    .mockResolvedValueOnce({ data: [{ storage_path: "p1/r1/a.jpg" }], error: null })
    .mockResolvedValueOnce({ data: [{ storage_path: "p1/designs/d1/b.jpg" }], error: null });

  const paths = await listProductionImagePaths("p1");

  expect(from).toHaveBeenCalledWith("roles");
  expect(from).toHaveBeenCalledWith("costume_designs");
  expect(paths.sort()).toEqual(["p1/designs/d1/b.jpg", "p1/r1/a.jpg"]);
});

test("listProductionImagePaths skips the image queries when a production has no roles or designs", async () => {
  eqFn
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  const paths = await listProductionImagePaths("p1");
  expect(paths).toEqual([]);
  // An empty `.in()` would match nothing but still costs a round trip.
  expect(inFn).not.toHaveBeenCalled();
});

test("listRoleImagePaths throws on a query error", async () => {
  inFn.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listRoleImagePaths("r1")).rejects.toThrow("boom");
});
```

Then extend `src/lib/storage.test.ts`. Replace its mock setup block (lines 3-12) with one that also exposes `remove`, and append two tests:

```ts
const copy = vi.fn();
const remove = vi.fn();
const from = vi.fn((_bucket: string) => ({ copy, remove }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { storage: { from: (b: string) => from(b) } } }));

import { copyImage, removeImages } from "@/lib/storage";

beforeEach(() => {
  copy.mockReset();
  remove.mockReset();
  from.mockClear();
});
```

```ts
test("removeImages throws on a storage error", async () => {
  remove.mockResolvedValue({ error: { message: "storage down" } });
  await expect(removeImages(["a.jpg"])).rejects.toThrow("storage down");
});

test("removeImages does not call storage for an empty list", async () => {
  await removeImages([]);
  expect(remove).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/storage-paths.test.ts src/lib/storage.test.ts`

Expected: FAIL. `@/lib/data/storage-paths` does not resolve, and `removeImages` currently discards its error so the throw test fails.

- [ ] **Step 3: Create the storage-paths module**

Create `src/lib/data/storage-paths.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

// Image storage paths, gathered so a delete can remove the files BEFORE the rows
// cascade away. The bucket key format (see src/lib/storage.ts) carries no org and
// no production for inventory images, so the only way to find an owner's files is
// through these tables — once the rows are gone the objects are unreachable.

async function pathsIn(table: string, column: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin.from(table).select("storage_path").in(column, ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { storage_path: string }).storage_path);
}

async function idsFor(table: string, productionId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from(table).select("id").eq("production_id", productionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function listRoleImagePaths(roleId: string): Promise<string[]> {
  return pathsIn("role_images", "role_id", [roleId]);
}

export async function listDesignImagePaths(designId: string): Promise<string[]> {
  return pathsIn("costume_design_images", "costume_design_id", [designId]);
}

// Every image belonging to a production: role photos for its roles, design photos
// for its designs.
export async function listProductionImagePaths(productionId: string): Promise<string[]> {
  const roleIds = await idsFor("roles", productionId);
  const designIds = await idsFor("costume_designs", productionId);
  const rolePaths = await pathsIn("role_images", "role_id", roleIds);
  const designPaths = await pathsIn("costume_design_images", "costume_design_id", designIds);
  return [...rolePaths, ...designPaths];
}
```

- [ ] **Step 4: Fix `removeImages`**

In `src/lib/storage.ts`, replace lines 31-34 with:

```ts
export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/storage-paths.test.ts src/lib/storage.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 6: Wire the three leaking delete routes**

Each collects paths, removes the files, then deletes the row — the same shape `src/app/api/inventory/[itemId]/route.ts:45-57` already uses.

In `src/app/api/productions/[id]/route.ts`, add to the imports:

```ts
import { listProductionImagePaths } from "@/lib/data/storage-paths";
import { removeImages } from "@/lib/storage";
```

and change the body of `DELETE` (lines 10-18) so the two new lines sit between the assertion and the delete:

```ts
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    await removeImages(await listProductionImagePaths(id));
    await deleteProduction(orgId, id);
    return NextResponse.json({ ok: true });
```

In `src/app/api/productions/[id]/roles/[roleId]/route.ts`, add:

```ts
import { listRoleImagePaths } from "@/lib/data/storage-paths";
import { removeImages } from "@/lib/storage";
```

and in `DELETE`:

```ts
    await assertProductionInOrg(orgId, id);
    await removeImages(await listRoleImagePaths(roleId));
    await deleteRole(id, roleId);
```

In `src/app/api/productions/[id]/designs/[designId]/route.ts`, add:

```ts
import { listDesignImagePaths } from "@/lib/data/storage-paths";
import { removeImages } from "@/lib/storage";
```

and in `DELETE`:

```ts
    await assertProductionInOrg(orgId, id);
    await removeImages(await listDesignImagePaths(designId));
    await deleteCostumeDesign(id, designId);
```

- [ ] **Step 7: Verify the whole suite, typecheck, and lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

Expected: all green. The suite was 597 passing; expect 597 + 7 = 604. Report the actual number. Lint had 0 errors and 41 pre-existing warnings in unrelated `src/lib/data/*.test.ts` — do not add new ones.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/storage-paths.ts src/lib/data/storage-paths.test.ts src/lib/storage.ts src/lib/storage.test.ts "src/app/api/productions/[id]/route.ts" "src/app/api/productions/[id]/roles/[roleId]/route.ts" "src/app/api/productions/[id]/designs/[designId]/route.ts"
git commit -m "fix(storage): delete image files when a production, role, or design is deleted

These three routes only ever deleted the DB rows, so every photo they owned was
orphaned in the bucket forever — the key format carries no org or production for
inventory images, so once the rows cascade the objects are unreachable.

Also make removeImages throw on a storage error; it was the only function in
storage.ts silently discarding one."
```

---

### Task 2: Migration and test-runner setup

**Files:**
- Create: `supabase/migrations/0030_org_deletion.sql`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the `deletion_log` table (`id`, `org_id`, `org_name`, `requested_at`, `completed_at`, `requested_by`, `notes`) consumed by `writeDeletionLog` in Task 3; nullable `feedback.org_id` and `feedback.user_id` required by `anonymizeOrgFeedback` in Task 3. Also makes Vitest pick up `scripts/**/*.test.mjs`, without which Task 3's tests would silently never run.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0030_org_deletion.sql`:

```sql
-- Support for operator-run organization deletion (see
-- docs/runbooks/delete-organization.md).

-- Proof that a deletion request was honored. Deliberately holds no organization
-- content and no foreign key — by definition the organizations row is gone by the
-- time this is written. This is the record that demonstrates the 30-day
-- commitment in /privacy was met.
create table if not exists deletion_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null,
  org_name      text,
  requested_at  timestamptz not null,
  completed_at  timestamptz not null default now(),
  requested_by  text,
  notes         text
);

-- Feedback is anonymized rather than deleted when its organization is removed, so
-- these two columns must be nullable. Nothing reads the table (the only query is
-- an insert in src/lib/data/feedback.ts), so this is safe.
alter table feedback alter column org_id drop not null;
alter table feedback alter column user_id drop not null;
```

- [ ] **Step 2: Widen the Vitest include**

In `vitest.config.ts`, change the `include` line to:

```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
```

Leave `environment: "node"` and the `@` alias alone.

- [ ] **Step 3: Prove the new include actually works**

A config change that silently does nothing is the failure mode here, so verify it with a throwaway file rather than assuming.

```bash
cat > scripts/lib/include-check.test.mjs <<'EOF'
import { expect, test } from "vitest";
test("vitest picks up scripts/**/*.test.mjs", () => {
  expect(true).toBe(true);
});
EOF
npx vitest run scripts/lib/include-check.test.mjs
```

Expected: PASS, 1 test. If Vitest reports "No test files found", the include pattern is wrong — fix it before continuing.

Then delete the throwaway:

```bash
rm scripts/lib/include-check.test.mjs
```

- [ ] **Step 4: Confirm nothing else broke**

Run: `npx vitest run && npx tsc --noEmit`

Expected: still 604 passing, tsc clean. The migration is not applied by this task — Chris runs it against Supabase by hand.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0030_org_deletion.sql vitest.config.ts
git commit -m "feat(deletion): migration 0030 - deletion_log, nullable feedback owner columns

deletion_log records that a request was honored, with no org content and no FK
since the org row is gone by the time it is written. feedback.org_id and
feedback.user_id become nullable so feedback can be anonymized rather than
deleted. Also widens the vitest include to cover scripts/**/*.test.mjs."
```

---

### Task 3: `scripts/lib/org-deletion.mjs`

**Files:**
- Create: `scripts/lib/org-deletion.mjs`, `scripts/lib/org-deletion.test.mjs`

**Interfaces:**
- Consumes: `deletion_log` and the nullable `feedback` columns from Task 2.
- Produces, all from `scripts/lib/org-deletion.mjs`:
  - `collectOrgStoragePaths(sb, orgId) => Promise<string[]>`
  - `summarizeOrg(sb, orgId) => Promise<{ orgName: string | null, tables: Record<string, number>, storageFiles: number }>`
  - `cancelOrgSubscription(stripe, sb, orgId) => Promise<{ cancelled: boolean, subscriptionId: string | null }>`
  - `anonymizeOrgFeedback(sb, orgId) => Promise<number>`
  - `deleteOrgRows(sb, orgId) => Promise<Record<string, number>>`
  - `writeDeletionLog(sb, entry) => Promise<void>` where `entry` is `{ orgId, orgName, requestedAt, requestedBy, notes }`
  - `ORG_TABLES: string[]` — the directly org-scoped table names, in the order `summarizeOrg` reports them

  Task 4's CLI imports all seven.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/org-deletion.test.mjs`. The fake keys queued responses by table name so tests stay order-independent across tables:

```js
import { expect, test, describe } from "vitest";
import {
  collectOrgStoragePaths,
  summarizeOrg,
  cancelOrgSubscription,
  anonymizeOrgFeedback,
  deleteOrgRows,
  writeDeletionLog,
  ORG_TABLES,
} from "./org-deletion.mjs";

// Minimal stand-in for the supabase-js query builder. Every chain method returns
// the same node and records what it was given; awaiting the node shifts the next
// queued response for that table. `calls` is the assertion surface.
function makeFake(responses = {}) {
  const queues = Object.fromEntries(
    Object.entries(responses).map(([t, v]) => [t, Array.isArray(v) ? [...v] : [v]]),
  );
  const calls = [];
  const client = {
    from(table) {
      const rec = { table, op: "select", filters: [], payload: null };
      calls.push(rec);
      const node = {
        select(cols, opts) { rec.cols = cols; rec.opts = opts; return node; },
        insert(p) { rec.op = "insert"; rec.payload = p; return node; },
        update(p) { rec.op = "update"; rec.payload = p; return node; },
        delete() { rec.op = "delete"; return node; },
        eq(c, v) { rec.filters.push(`eq:${c}=${v}`); return node; },
        in(c, v) { rec.filters.push(`in:${c}=[${v.join(",")}]`); return node; },
        or(expr) { rec.filters.push(`or:${expr}`); return node; },
        maybeSingle() { rec.single = true; return node; },
        then(res, rej) {
          const q = queues[table] ?? [];
          const next = q.shift() ?? { data: [], error: null, count: 0 };
          return Promise.resolve(next).then(res, rej);
        },
      };
      return node;
    },
  };
  return { client, calls };
}

const tablesOf = (calls) => calls.map((c) => c.table);

describe("collectOrgStoragePaths", () => {
  test("gathers role, design, and inventory image paths", async () => {
    const { client, calls } = makeFake({
      productions: { data: [{ id: "p1" }], error: null },
      roles: { data: [{ id: "r1" }], error: null },
      costume_designs: { data: [{ id: "d1" }], error: null },
      role_images: { data: [{ storage_path: "p1/r1/a.jpg" }], error: null },
      costume_design_images: { data: [{ storage_path: "p1/designs/d1/b.jpg" }], error: null },
      inventory_items: { data: [{ id: "i1" }], error: null },
      inventory_item_images: { data: [{ storage_path: "inventory/i1/c.jpg" }], error: null },
    });

    const paths = await collectOrgStoragePaths(client, "org_1");

    expect(paths.sort()).toEqual([
      "inventory/i1/c.jpg",
      "p1/designs/d1/b.jpg",
      "p1/r1/a.jpg",
    ]);
    // Inventory paths contain no production id, so this branch is the easy one to miss.
    expect(tablesOf(calls)).toContain("inventory_item_images");
  });

  test("returns an empty list and skips image queries when the org has nothing", async () => {
    const { client, calls } = makeFake({
      productions: { data: [], error: null },
      inventory_items: { data: [], error: null },
    });
    const paths = await collectOrgStoragePaths(client, "org_1");
    expect(paths).toEqual([]);
    expect(tablesOf(calls)).not.toContain("role_images");
    expect(tablesOf(calls)).not.toContain("inventory_item_images");
  });

  test("deduplicates repeated paths", async () => {
    const { client } = makeFake({
      productions: { data: [{ id: "p1" }], error: null },
      roles: { data: [{ id: "r1" }], error: null },
      costume_designs: { data: [{ id: "d1" }], error: null },
      role_images: { data: [{ storage_path: "dup.jpg" }], error: null },
      costume_design_images: { data: [{ storage_path: "dup.jpg" }], error: null },
      inventory_items: { data: [], error: null },
    });
    expect(await collectOrgStoragePaths(client, "org_1")).toEqual(["dup.jpg"]);
  });

  test("throws on a query error", async () => {
    const { client } = makeFake({ productions: { data: null, error: { message: "boom" } } });
    await expect(collectOrgStoragePaths(client, "org_1")).rejects.toThrow("boom");
  });
});

describe("cancelOrgSubscription", () => {
  test("cancels the subscription and never touches the customer", async () => {
    const cancel = vi.fn().mockResolvedValue({});
    const del = vi.fn();
    const stripe = { subscriptions: { cancel }, customers: { del } };
    const { client } = makeFake({
      org_subscriptions: { data: { stripe_subscription_id: "sub_1" }, error: null },
    });

    const result = await cancelOrgSubscription(stripe, client, "org_1");

    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(del).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: true, subscriptionId: "sub_1" });
  });

  test("no-ops when the org has no subscription row", async () => {
    const cancel = vi.fn();
    const stripe = { subscriptions: { cancel }, customers: { del: vi.fn() } };
    const { client } = makeFake({ org_subscriptions: { data: null, error: null } });

    const result = await cancelOrgSubscription(stripe, client, "org_1");

    expect(cancel).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: false, subscriptionId: null });
  });
});

describe("anonymizeOrgFeedback", () => {
  test("nulls the owner columns and leaves the message alone", async () => {
    const { client, calls } = makeFake({
      feedback: { data: [{ id: "f1" }, { id: "f2" }], error: null },
    });

    const count = await anonymizeOrgFeedback(client, "org_1");

    const call = calls.find((c) => c.table === "feedback");
    expect(call.op).toBe("update");
    expect(call.payload).toEqual({ user_email: null, user_id: null, org_id: null });
    expect(call.payload).not.toHaveProperty("message");
    expect(call.filters).toContain("eq:org_id=org_1");
    expect(count).toBe(2);
  });
});

describe("deleteOrgRows", () => {
  test("deletes the three unconstrained tables and the org row", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");

    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.map((c) => c.table)).toEqual([
      "fabric_widths",
      "fabric_suppliers",
      "production_shares",
      "organizations",
    ]);
  });

  test("matches production_shares on either org column", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");
    const shares = calls.find((c) => c.table === "production_shares");
    expect(shares.filters.join(" ")).toContain("source_org_id");
    expect(shares.filters.join(" ")).toContain("accepted_by_org_id");
  });

  test("never deletes the feedback table", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");
    expect(calls.filter((c) => c.op === "delete").map((c) => c.table)).not.toContain("feedback");
  });
});

describe("summarizeOrg", () => {
  test("reports the org name, a count per table, and the file count", async () => {
    const responses = { organizations: [{ data: { name: "Nada's Theater" }, error: null }] };
    for (const t of ORG_TABLES) responses[t] = { data: null, error: null, count: 3 };
    responses.productions = [{ data: null, error: null, count: 3 }, { data: [], error: null }];
    responses.inventory_items = [{ data: null, error: null, count: 3 }, { data: [], error: null }];

    const { client } = makeFake(responses);
    const summary = await summarizeOrg(client, "org_1");

    expect(summary.orgName).toBe("Nada's Theater");
    expect(Object.keys(summary.tables)).toEqual(ORG_TABLES);
    expect(summary.storageFiles).toBe(0);
  });
});

describe("writeDeletionLog", () => {
  test("inserts the log row with the supplied dates", async () => {
    const { client, calls } = makeFake({});
    await writeDeletionLog(client, {
      orgId: "org_1",
      orgName: "Nada's Theater",
      requestedAt: "2026-08-01T00:00:00.000Z",
      requestedBy: "ticket-42",
      notes: null,
    });
    const call = calls.find((c) => c.table === "deletion_log");
    expect(call.op).toBe("insert");
    expect(call.payload).toMatchObject({
      org_id: "org_1",
      org_name: "Nada's Theater",
      requested_at: "2026-08-01T00:00:00.000Z",
      requested_by: "ticket-42",
    });
  });
});
```

Add `vi` to the vitest import at the top of the file: `import { expect, test, describe, vi } from "vitest";`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/org-deletion.test.mjs`

Expected: FAIL — `./org-deletion.mjs` does not exist.

- [ ] **Step 3: Write the module**

Create `scripts/lib/org-deletion.mjs`:

```js
// Organization deletion, factored so every function takes its client as the first
// argument — that is what makes the most dangerous code in this app unit-testable
// (see scripts/lib/org-deletion.test.mjs). This module reads no env and holds no
// client of its own; scripts/delete-org.mjs wires those in.
//
// Ordering matters and is enforced by the caller, not here:
//   cancel Stripe -> collect+delete storage -> anonymize feedback -> delete rows.
// See docs/superpowers/specs/2026-07-27-org-deletion-design.md.

// Tables carrying org_id directly. Cascade descendants are implied by these.
export const ORG_TABLES = [
  "productions",
  "makers",
  "inventory_items",
  "fabric_widths",
  "fabric_suppliers",
  "feedback",
  "production_shares",
  "org_subscriptions",
  "production_purchases",
  "seat_purchases",
  "org_domains",
];

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function idsBy(sb, table, column, value) {
  return unwrap(await sb.from(table).select("id").eq(column, value)).map((r) => r.id);
}

async function pathsIn(sb, table, column, ids) {
  if (ids.length === 0) return [];
  return unwrap(await sb.from(table).select("storage_path").in(column, ids)).map((r) => r.storage_path);
}

// Every storage object the org owns. The bucket key format carries no org id, and
// inventory paths carry no production id either, so these joins are the only way
// to find the files — and they must run BEFORE the rows cascade away.
export async function collectOrgStoragePaths(sb, orgId) {
  const productionIds = await idsBy(sb, "productions", "org_id", orgId);

  let rolePaths = [];
  let designPaths = [];
  if (productionIds.length > 0) {
    const roleIds = unwrap(
      await sb.from("roles").select("id").in("production_id", productionIds),
    ).map((r) => r.id);
    const designIds = unwrap(
      await sb.from("costume_designs").select("id").in("production_id", productionIds),
    ).map((r) => r.id);
    rolePaths = await pathsIn(sb, "role_images", "role_id", roleIds);
    designPaths = await pathsIn(sb, "costume_design_images", "costume_design_id", designIds);
  }

  const itemIds = await idsBy(sb, "inventory_items", "org_id", orgId);
  const inventoryPaths = await pathsIn(sb, "inventory_item_images", "inventory_item_id", itemIds);

  return [...new Set([...rolePaths, ...designPaths, ...inventoryPaths])];
}

async function countIn(sb, table, orgId) {
  const column = table === "production_shares" ? "source_org_id" : "org_id";
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true }).eq(column, orgId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function summarizeOrg(sb, orgId) {
  const { data: org, error } = await sb
    .from("organizations")
    .select("name")
    .eq("clerk_org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const tables = {};
  for (const table of ORG_TABLES) tables[table] = await countIn(sb, table, orgId);

  const storageFiles = (await collectOrgStoragePaths(sb, orgId)).length;
  return { orgName: org?.name ?? null, tables, storageFiles };
}

// Cancels the subscription. Deliberately does NOT delete the Stripe customer —
// invoices are the financial records /privacy promises to retain.
export async function cancelOrgSubscription(stripe, sb, orgId) {
  const { data, error } = await sb
    .from("org_subscriptions")
    .select("stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const subscriptionId = data?.stripe_subscription_id ?? null;
  if (!subscriptionId) return { cancelled: false, subscriptionId: null };

  await stripe.subscriptions.cancel(subscriptionId);
  return { cancelled: true, subscriptionId };
}

// Anonymize rather than delete: the product signal in `message` is kept, the owner
// columns are cleared. Must run BEFORE deleteOrgRows, which is what stops matching
// on org_id. Note this is pseudonymization, not anonymization — free text can hold
// personal data, which is why the runbook requires a human read first.
export async function anonymizeOrgFeedback(sb, orgId) {
  const rows = unwrap(
    await sb
      .from("feedback")
      .update({ user_email: null, user_id: null, org_id: null })
      .eq("org_id", orgId)
      .select("id"),
  );
  return rows.length;
}

// The three tables the cascade misses (feedback is the fourth, handled above),
// then the org row itself — that cascade takes everything else.
export async function deleteOrgRows(sb, orgId) {
  const counts = {};

  counts.fabric_widths = unwrap(
    await sb.from("fabric_widths").delete().eq("org_id", orgId).select("id"),
  ).length;

  counts.fabric_suppliers = unwrap(
    await sb.from("fabric_suppliers").delete().eq("org_id", orgId).select("id"),
  ).length;

  counts.production_shares = unwrap(
    await sb
      .from("production_shares")
      .delete()
      .or(`source_org_id.eq.${orgId},accepted_by_org_id.eq.${orgId}`)
      .select("id"),
  ).length;

  counts.organizations = unwrap(
    await sb.from("organizations").delete().eq("clerk_org_id", orgId).select("clerk_org_id"),
  ).length;

  return counts;
}

export async function writeDeletionLog(sb, entry) {
  const { error } = await sb.from("deletion_log").insert({
    org_id: entry.orgId,
    org_name: entry.orgName,
    requested_at: entry.requestedAt,
    requested_by: entry.requestedBy ?? null,
    notes: entry.notes ?? null,
  });
  if (error) throw new Error(error.message);
}
```

> **Superseded 2026-07-28:** the `countIn` and `deleteOrgRows` code above (this
> was the original plan for Task 3, before review) matches `production_shares`
> on a single column / a single `.or(...)` delete across both columns. The
> whole-branch review changed this: the shipped `countIn` counts `.or(source_org_id.eq...,accepted_by_org_id.eq...)`
> for the dry-run/verify summary, and the shipped `deleteOrgRows` performs two
> separate operations — delete where this org is the source, release
> (`accepted_by_org_id` → null) where it's the recipient of another org's
> share, so that org's own record of the share survives. See the real
> `scripts/lib/org-deletion.mjs` for what actually shipped; this code block is
> left as-is for history.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/org-deletion.test.mjs`

Expected: PASS, 12 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npx vitest run && npm run lint`

Expected: 604 + 12 = 616 passing. Report the actual number. If ESLint complains about `scripts/**`, check whether the repo's flat config ignores that directory; if it does, leave it ignored rather than widening lint scope in this task.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/org-deletion.mjs scripts/lib/org-deletion.test.mjs
git commit -m "feat(deletion): org deletion functions with an injectable client

Every function takes its Supabase client as the first argument so the fake in
org-deletion.test.mjs can drive it — this is the most destructive code in the
app and it needs real tests. Cancels the Stripe subscription without deleting
the customer, collects storage paths before rows can cascade away, anonymizes
feedback instead of deleting it, and clears the three tables the cascade misses."
```

---

### Task 4: `scripts/delete-org.mjs` — the CLI

**Files:**
- Create: `scripts/delete-org.mjs`

**Interfaces:**
- Consumes: all seven exports from `scripts/lib/org-deletion.mjs` (Task 3), and `deletion_log` from Task 2.
- Produces: the operator entry point. No later task imports it.

- [ ] **Step 1: Write the CLI**

There is no TDD cycle here — the logic under test lives in Task 3's module, and this file is argument parsing plus sequencing. Do not add a test that merely asserts `console.log` was called.

Create `scripts/delete-org.mjs`:

```js
// Operator-run organization deletion. Dry-run by default; --confirm mutates.
//
//   node scripts/delete-org.mjs --org <clerk_org_id>
//   node scripts/delete-org.mjs --org <clerk_org_id> --confirm --requested-at 2026-08-01 [--requested-by ref] [--notes text]
//   node scripts/delete-org.mjs --org <clerk_org_id> --verify
//
// Follow docs/runbooks/delete-organization.md — this script is one step in it, and
// it deliberately does NOT delete the Clerk organization.
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import {
  collectOrgStoragePaths,
  summarizeOrg,
  cancelOrgSubscription,
  anonymizeOrgFeedback,
  deleteOrgRows,
  writeDeletionLog,
} from "./lib/org-deletion.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
const has = (name) => process.argv.includes(`--${name}`);

const orgId = arg("org");
if (!orgId) {
  console.error("Usage: node scripts/delete-org.mjs --org <clerk_org_id> [--confirm --requested-at <date>] [--verify]");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function printSummary(summary) {
  console.log(`  organization: ${summary.orgName ?? "(not found)"}`);
  for (const [table, count] of Object.entries(summary.tables)) {
    console.log(`  ${table.padEnd(22)} ${count}`);
  }
  console.log(`  ${"storage files".padEnd(22)} ${summary.storageFiles}`);
}

// --verify: confirm the Supabase side is clean. Cannot see Clerk.
if (has("verify")) {
  const summary = await summarizeOrg(sb, orgId);
  printSummary(summary);
  const leftovers = Object.entries(summary.tables).filter(([, n]) => n > 0);
  if (leftovers.length > 0 || summary.storageFiles > 0 || summary.orgName !== null) {
    console.error("\n  ✗ NOT clean — the rows above are still present.");
    process.exit(1);
  }
  console.log("\n  ✓ Supabase is clean for this org.");
  console.log("    This does NOT verify Clerk — check the dashboard by hand.");
  process.exit(0);
}

const summary = await summarizeOrg(sb, orgId);
if (summary.orgName === null) {
  console.error(`No organization row found for ${orgId}. Check the id.`);
  process.exit(1);
}

console.log(`\nOrganization ${orgId}`);
printSummary(summary);

if (!has("confirm")) {
  console.log("\n  DRY RUN — nothing was changed.");
  console.log("  Re-run with --confirm --requested-at <ISO date> to delete.");
  process.exit(0);
}

const requestedAt = arg("requested-at");
if (!requestedAt) {
  console.error("\n  --requested-at <ISO date> is required with --confirm.");
  console.error("  The deletion log is worthless without the date the 30-day clock started.");
  process.exit(2);
}

console.log("\nDeleting — do not interrupt.\n");

// 1. Stripe first. After the org row goes, its webhooks fail the org FK and
//    Stripe retries them forever; and an uncancelled subscription keeps charging.
if (env.STRIPE_SECRET_KEY) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const { cancelled, subscriptionId } = await cancelOrgSubscription(stripe, sb, orgId);
  console.log(cancelled ? `  ✓ Stripe subscription ${subscriptionId} cancelled` : "  · no Stripe subscription");
} else {
  console.log("  · STRIPE_SECRET_KEY not set — skipping Stripe (cancel by hand if the org had a subscription)");
}

// 2. Storage before the cascade — afterwards the paths are unreachable.
const paths = await collectOrgStoragePaths(sb, orgId);
if (paths.length > 0) {
  const { error } = await sb.storage.from("role-images").remove(paths);
  if (error) throw new Error(`storage removal failed: ${error.message}`);
}
console.log(`  ✓ ${paths.length} storage objects removed`);

// 3. Feedback before the org row — this matches on org_id.
console.log(`  ✓ ${await anonymizeOrgFeedback(sb, orgId)} feedback rows anonymized`);

// 4. The three tables the cascade misses, then the org row.
for (const [table, count] of Object.entries(await deleteOrgRows(sb, orgId))) {
  console.log(`  ✓ ${table.padEnd(22)} ${count} rows`);
}

// 5. Proof the request was honored.
await writeDeletionLog(sb, {
  orgId,
  orgName: summary.orgName,
  requestedAt,
  requestedBy: arg("requested-by"),
  notes: arg("notes"),
});
console.log("  ✓ deletion_log written");

console.log("\n  ⚠ MANUAL STEP REMAINING");
console.log("    Delete the Clerk organization by hand:");
console.log(`    dashboard.clerk.com → Organizations → ${orgId} → Delete`);
console.log("    Use the PRODUCTION instance, not development.\n");
console.log(`    Then: node scripts/delete-org.mjs --org ${orgId} --verify\n`);
```

- [ ] **Step 2: Verify the dry-run path is genuinely inert**

This is the guardrail that matters most, so prove it rather than trusting it. Confirm by reading the file that between the `--confirm` check and `process.exit(0)` there is no write of any kind, and that every mutating call sits below that guard. Then check the argument handling actually behaves:

```bash
node scripts/delete-org.mjs
```

Expected: usage message, exit code 2, no `.env.local` read attempted.

```bash
node scripts/delete-org.mjs --org org_doesnotexist
```

Expected: reads `.env.local`, prints zero counts and `(not found)`, exits 1 with "No organization row found". **Nothing is mutated.** If `.env.local` is absent in this environment, report that rather than creating one.

- [ ] **Step 3: Confirm the suite still passes**

Run: `npx vitest run`

Expected: 616 passing, unchanged — this task adds no tests.

- [ ] **Step 4: Commit**

```bash
git add scripts/delete-org.mjs
git commit -m "feat(deletion): delete-org CLI, dry-run by default

Sequences the deletion in the only order that works: Stripe cancel, then storage
(paths are unreachable once rows cascade), then feedback anonymization (it
matches on org_id), then the unconstrained tables and the org row, then the
deletion log. Requires --confirm to mutate and --requested-at to record when the
30-day clock started. Prints the manual Clerk step; --verify re-checks Supabase."
```

---

### Task 5: Runbook and whole-feature verification

**Files:**
- Create: `docs/runbooks/delete-organization.md`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the operator procedure, plus a verified branch.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/delete-organization.md`:

```markdown
# Runbook: delete an organization

Use when someone emails privacy@measuremycostume.com asking for their
organization and its data to be deleted. `/privacy` and `/terms` commit us to
completing this **within 30 days of a verified request**.

This is irreversible. Supabase Free has no point-in-time recovery, so a wrong
org id cannot be undone.

## 1. Verify the requester

Confirm in the Clerk dashboard that they are an **admin** of the organization
they are asking about. Do not proceed on an email address alone.

**Record the date the request arrived.** That starts the 30-day clock and it is
what goes in `--requested-at`.

## 2. Find the org id

Clerk dashboard → Organizations → the org → copy its `org_…` id.

## 3. Dry run

    node scripts/delete-org.mjs --org <org_id>

Read the counts. They should look like the organization you expect — a company
with three productions should not report forty. **A surprising count means you
have the wrong id.** Stop and re-check.

## 4. Review the feedback rows

The script anonymizes feedback rather than deleting it, clearing the owner
columns but keeping `message`. Free text can contain personal data — someone's
own email address, a performer's name — and no automated pass catches that
reliably.

Read this organization's feedback messages in Supabase before continuing, and
delete or redact any that contain personal data:

    select id, created_at, message from feedback where org_id = '<org_id>' order by created_at;

Skipping this step means retaining personal data you told the requester you
deleted.

## 5. Delete

    node scripts/delete-org.mjs --org <org_id> --confirm --requested-at <YYYY-MM-DD> --requested-by "<reference>"

Use a non-identifying reference for `--requested-by` where you have one (a
ticket number). It is stored to evidence compliance, so avoid putting more
personal data in it than you need.

If the script aborts partway, read what it reports as done. Re-running is safe —
each step is idempotent — but the Stripe cancellation will already have happened.

## 6. Delete the Clerk organization

The script does not do this. In the Clerk dashboard, **production instance**,
Organizations → the org → Delete.

## 7. Verify

    node scripts/delete-org.mjs --org <org_id> --verify

Expect "Supabase is clean for this org." This cannot see Clerk — confirm step 6
by eye.

## 8. Close it out

Reply to the requester confirming completion. Check the `deletion_log` row
exists and its dates are right:

    select * from deletion_log where org_id = '<org_id>';

That row is the evidence the 30-day commitment was met.
```

> **Superseded 2026-07-28:** the embedded runbook draft above (this was the
> original Task 5 plan) still claims "each step is idempotent" for the
> re-run guidance under step 5, and still has the Clerk deletion (step 6)
> happen *after* the `--confirm` run (step 5). The whole-branch review found
> both wrong:
> - Stripe cancellation's re-run safety was never established either way — the
>   shipped runbook (`docs/runbooks/delete-organization.md`) calls this out
>   explicitly instead of claiming blanket idempotency.
> - Deleting the Clerk org *after* the script leaves a window where a member's
>   in-flight request re-creates the `organizations` row via `ensureOrgRow` /
>   `ensureOrganization`, invalidating `--verify`. The shipped runbook moves the
>   Clerk deletion earlier (its step 5, before the `--confirm` run) specifically
>   to close that window.
>
> The shipped runbook is correct; this embedded draft is left as-is for
> history.

- [ ] **Step 2: Run the full verification**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

Expected: 616 passing, tsc clean, 0 lint errors (41 pre-existing warnings unchanged), build succeeds. Report the actual numbers — do not assume them.

- [ ] **Step 3: Confirm the constraints held**

Verify by grep, and report the output of each:

```bash
grep -rn "customers.del" scripts/ src/ || echo "OK: Stripe customer is never deleted"
grep -rn "clerk" scripts/ -i || echo "OK: scripts never touch Clerk"
grep -rn 'from("feedback").delete\|from("feedback")\s*$' scripts/ || echo "OK: feedback is never deleted"
```

Each must report its OK line. A hit is a constraint violation and must be reported, not fixed silently.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/delete-organization.md
git commit -m "docs(deletion): operator runbook for deleting an organization

Covers requester verification, the dry-run count check that catches a wrong org
id, the manual feedback review that free-text anonymization depends on, the
Clerk step the script deliberately leaves to a human, and closing the loop on
the deletion_log row that evidences the 30-day commitment."
```

- [ ] **Step 5: Report the handoff items**

Do not push and do not deploy. Report to Chris:

1. **Migration `0030_org_deletion.sql` must be applied to Supabase by hand** before the script will run. Until then `deletion_log` does not exist and `anonymizeOrgFeedback` fails on the NOT NULL constraints.
2. The script needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `STRIPE_SECRET_KEY` in `.env.local`. Without the Stripe key it skips cancellation and says so — that would leave a subscription billing.
3. Nothing here has been exercised against a real organization. The first real run should be the dry run in the runbook's step 3, read carefully.

---

## Self-Review

**Spec coverage.** Migration and `feedback` nullability → Task 2. `collectOrgStoragePaths`, `summarizeOrg`, `cancelOrgSubscription`, `anonymizeOrgFeedback`, `deleteOrgRows`, `writeDeletionLog` → Task 3. CLI with dry-run/`--confirm`/`--verify` and the eight-step ordering → Task 4. `storage-paths.ts`, the three route fixes, and `removeImages` throwing → Task 1. Runbook → Task 5. Vitest include widening → Task 2 (the spec calls for it under Testing). Every spec section maps to a task.

**Deviation from the spec, deliberate.** The spec's testing section lists a case asserting "the CLI performs no mutation without `--confirm`… by running the dry-run path against a fake client." The CLI reads `.env.local` and constructs a real client at module scope, so driving it with a fake would mean restructuring it into an injectable function purely to test argument parsing. Task 4 Step 2 instead verifies the guard by code reading plus two real invocations that exit before any write. The behavior is confirmed; the mechanism differs. Flagged rather than silently dropped.

**Placeholder scan.** No TBD, TODO, "handle edge cases", or "similar to Task N". Every code step carries complete, paste-ready content.

**Type consistency.** `collectOrgStoragePaths`, `summarizeOrg`, `cancelOrgSubscription`, `anonymizeOrgFeedback`, `deleteOrgRows`, `writeDeletionLog`, and `ORG_TABLES` are defined in Task 3 and imported under exactly those names in Task 4. `writeDeletionLog`'s `entry` uses `orgId`/`orgName`/`requestedAt`/`requestedBy`/`notes` in both the definition, its test, and the CLI call site. `listProductionImagePaths`/`listRoleImagePaths`/`listDesignImagePaths` are defined and consumed only within Task 1.
