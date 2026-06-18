# Cross-Org Production Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org admin share a production as a one-time, independent copy (design layer only) that a recipient org accepts via a link.

**Architecture:** A `production_shares` table holds a token per share. The copy engine (`copyDesignLayer`) composes existing data functions to duplicate roles + designs + their notes/images (image files copied to new storage paths) into a NEW production in the recipient's org — never touching performer-layer tables. Routes create/revoke/accept shares; a `SharePanel` (admin) and a `/share/[token]` page drive the UX.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Supabase, Clerk, Vitest (node env — no jsdom/RTL).

## Global Constraints

- Schema change goes in **`supabase/migrations/0027_production_shares.sql`** (next number; highest existing is `0026`).
- **Do NOT apply the migration to Supabase, push to GitHub, or deploy.** Local commits only; hold for Chris's explicit green light.
- Tests run in the **node** Vitest environment — component JSX verified by `tsc --noEmit` + `npm run build`, NOT unit tests.
- **Copy the design layer only:** roles (`name`, `notes`, `display_order`), role_images, costume_designs (`name`, `notes`, `display_order`; `inventory_item_id` → null), costume_design_images. **Never read/write** performers, casts, castings, costume_pieces, performer_measurements, show_dates, makers, fabric settings.
- New production: `title`/`notes` copied verbatim; `created_by` = accepting user; `inventory_item_id` not copied.
- Image files are **duplicated** to new paths (`${newProd}/${newRole}/<uuid>.jpg`, `${newProd}/designs/${newDesign}/<uuid>.jpg`) via `copyImage`; a per-file copy error is swallowed (logged) and never aborts the accept.
- Share links are **single-use** (accepted exactly once). Accept of a used/revoked token → `ValidationError` → 400.
- Admin-gated create/revoke/list via `requireOrgAdmin()`; accept via `getAuthContext()` (signed-in + active org). The "only paying orgs may share" and "must subscribe to use" gates are OUT of scope (pricing project).
- The absolute share link is built server-side from `new URL(request.url).origin` (email) and client-side from `window.location.origin` (copy). No new env var.
- Client fetches use `credentials: "include"`. `ValidationError` → 400 and `AuthError` → its status, via `errorResponse`.
- Run the full suite with `npm test`. Current baseline: 463 passing.

---

### Task 1: Migration `0027` — `production_shares`

**Files:**
- Create: `supabase/migrations/0027_production_shares.sql`

**Interfaces:**
- Produces: the `production_shares` table.

> No automated test (SQL migration). Verification is self-review — not applied this session.

- [ ] **Step 1: Create the migration file**

```sql
-- One-time cross-org production shares. Each row is a single-use invite token; on
-- accept, the design layer is copied into a new production in the recipient's org.
create table if not exists production_shares (
  id                      uuid primary key default gen_random_uuid(),
  source_production_id    uuid not null references productions(id) on delete cascade,
  source_org_id           text not null,
  created_by              text not null,
  token                   text not null unique,
  recipient_email         text,
  status                  text not null default 'pending' check (status in ('pending','accepted','revoked')),
  accepted_by_org_id      text,
  accepted_production_id  uuid references productions(id) on delete set null,
  created_at              timestamptz not null default now(),
  accepted_at             timestamptz
);
create index if not exists production_shares_token_idx on production_shares (token);
create index if not exists production_shares_source_idx on production_shares (source_production_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0027_production_shares.sql
git commit -m "feat(db): 0027 adds production_shares table"
```

---

### Task 2: Copy-support data helpers

**Files:**
- Modify: `src/lib/data/productions.ts` (add `getProductionByIdUnscoped`)
- Modify: `src/lib/data/roles.ts` (add `insertRoleCopy`)
- Modify: `src/lib/data/costume-designs.ts` (add `insertCostumeDesignCopy`)
- Test: `src/lib/data/production-copy-helpers.test.ts`

**Interfaces:**
- Produces:
  - `getProductionByIdUnscoped(id: string): Promise<Production | null>` — fetch a production by id with NO org filter (the share token is the capability).
  - `insertRoleCopy(input: { productionId: string; name: string; notes: string | null; displayOrder: number }): Promise<Role>`
  - `insertCostumeDesignCopy(input: { productionId: string; roleId: string; name: string; notes: string | null; displayOrder: number }): Promise<CostumeDesign>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/production-copy-helpers.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "eq", "order"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { getProductionByIdUnscoped } from "@/lib/data/productions";
import { insertRoleCopy } from "@/lib/data/roles";
import { insertCostumeDesignCopy } from "@/lib/data/costume-designs";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("getProductionByIdUnscoped fetches by id with no org filter", async () => {
  setResult({ id: "p1", title: "Cats" });
  const row = await getProductionByIdUnscoped("p1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(chain.eq).toHaveBeenCalledWith("id", "p1");
  expect(chain.eq).not.toHaveBeenCalledWith("org_id", expect.anything());
  expect(row).toEqual({ id: "p1", title: "Cats" });
});

test("insertRoleCopy inserts name, notes, and display_order", async () => {
  setResult({ id: "r2", production_id: "p2", name: "Wizard", notes: "flowing", display_order: 3 });
  await insertRoleCopy({ productionId: "p2", name: "Wizard", notes: "flowing", displayOrder: 3 });
  expect(chain.insert).toHaveBeenCalledWith({ production_id: "p2", name: "Wizard", notes: "flowing", display_order: 3 });
});

test("insertCostumeDesignCopy inserts role, name, notes, and display_order", async () => {
  setResult({ id: "d2", production_id: "p2", role_id: "r2", name: "Cloak", notes: "lined", display_order: 1 });
  await insertCostumeDesignCopy({ productionId: "p2", roleId: "r2", name: "Cloak", notes: "lined", displayOrder: 1 });
  expect(chain.insert).toHaveBeenCalledWith({ production_id: "p2", role_id: "r2", name: "Cloak", notes: "lined", display_order: 1 });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/data/production-copy-helpers.test.ts`
Expected: FAIL — the three functions don't exist yet.

- [ ] **Step 3: Add `getProductionByIdUnscoped` to `productions.ts`**

Append to `src/lib/data/productions.ts`:

```ts
// Fetch a production by id WITHOUT an org filter. Only for capability-gated paths
// (e.g. a share token), never for normal org-scoped reads — use getProduction for those.
export async function getProductionByIdUnscoped(id: string): Promise<Production | null> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Production) ?? null;
}
```

- [ ] **Step 4: Add `insertRoleCopy` to `roles.ts`**

Append to `src/lib/data/roles.ts`:

```ts
// Insert a role preserving name/notes/display_order (used by the share copy engine).
export async function insertRoleCopy(input: {
  productionId: string;
  name: string;
  notes: string | null;
  displayOrder: number;
}): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ production_id: input.productionId, name: input.name, notes: input.notes, display_order: input.displayOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}
```

- [ ] **Step 5: Add `insertCostumeDesignCopy` to `costume-designs.ts`**

Append to `src/lib/data/costume-designs.ts`:

```ts
// Insert a costume design preserving role/name/notes/display_order (share copy engine).
// inventory_item_id is intentionally not copied — inventory is org-specific.
export async function insertCostumeDesignCopy(input: {
  productionId: string;
  roleId: string;
  name: string;
  notes: string | null;
  displayOrder: number;
}): Promise<CostumeDesign> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .insert({ production_id: input.productionId, role_id: input.roleId, name: input.name, notes: input.notes, display_order: input.displayOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesign;
}
```

- [ ] **Step 6: Run, verify pass**

Run: `npx vitest run src/lib/data/production-copy-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/roles.ts src/lib/data/costume-designs.ts src/lib/data/production-copy-helpers.test.ts
git commit -m "feat(data): copy-support helpers for production sharing"
```

---

### Task 3: Copy engine — `copyDesignLayer`

**Files:**
- Create: `src/lib/data/production-copy.ts`
- Test: `src/lib/data/production-copy.test.ts`

**Interfaces:**
- Consumes (Task 2): `getProductionByIdUnscoped`, `createProduction`, `insertRoleCopy`, `insertCostumeDesignCopy`; existing `listRoles`, `listRoleImagesForRoles`, `addRoleImage`, `listCostumeDesigns`, `listCostumeDesignImages`, `addCostumeDesignImage`, `copyImage`.
- Produces: `copyDesignLayer(input: { sourceProductionId: string; targetOrgId: string; userId: string }): Promise<{ productionId: string }>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/production-copy.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getProductionByIdUnscoped = vi.fn();
const createProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  getProductionByIdUnscoped: (...a: unknown[]) => getProductionByIdUnscoped(...a),
  createProduction: (...a: unknown[]) => createProduction(...a),
}));

const listRoles = vi.fn();
const insertRoleCopy = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  insertRoleCopy: (...a: unknown[]) => insertRoleCopy(...a),
}));

const listRoleImagesForRoles = vi.fn();
const addRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  listRoleImagesForRoles: (...a: unknown[]) => listRoleImagesForRoles(...a),
  addRoleImage: (...a: unknown[]) => addRoleImage(...a),
}));

const listCostumeDesigns = vi.fn();
const insertCostumeDesignCopy = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({
  listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a),
  insertCostumeDesignCopy: (...a: unknown[]) => insertCostumeDesignCopy(...a),
}));

const listCostumeDesignImages = vi.fn();
const addCostumeDesignImage = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({
  listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a),
  addCostumeDesignImage: (...a: unknown[]) => addCostumeDesignImage(...a),
}));

const copyImage = vi.fn();
vi.mock("@/lib/storage", () => ({ copyImage: (...a: unknown[]) => copyImage(...a) }));

import { copyDesignLayer } from "@/lib/data/production-copy";

beforeEach(() => {
  [getProductionByIdUnscoped, createProduction, listRoles, insertRoleCopy, listRoleImagesForRoles,
    addRoleImage, listCostumeDesigns, insertCostumeDesignCopy, listCostumeDesignImages,
    addCostumeDesignImage, copyImage].forEach((m) => m.mockReset());
});

test("copyDesignLayer copies production, roles, designs, and duplicates images to new paths", async () => {
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats", notes: "fun" });
  createProduction.mockResolvedValue({ id: "p2" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Wizard", notes: "fl", display_order: 0 }]);
  insertRoleCopy.mockResolvedValue({ id: "r1new" });
  listRoleImagesForRoles.mockResolvedValue([{ id: "ri1", role_id: "r1", storage_path: "p1/r1/a.jpg" }]);
  addRoleImage.mockResolvedValue({});
  listCostumeDesigns.mockResolvedValue([{ id: "d1", role_id: "r1", name: "Cloak", notes: "dn", display_order: 0 }]);
  insertCostumeDesignCopy.mockResolvedValue({ id: "d1new" });
  listCostumeDesignImages.mockResolvedValue([{ id: "di1", costume_design_id: "d1", storage_path: "p1/designs/d1/b.jpg" }]);
  addCostumeDesignImage.mockResolvedValue({});
  copyImage.mockResolvedValue(undefined);

  const out = await copyDesignLayer({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });

  expect(createProduction).toHaveBeenCalledWith({ orgId: "orgB", createdBy: "u1", title: "Cats", notes: "fun" });
  expect(insertRoleCopy).toHaveBeenCalledWith({ productionId: "p2", name: "Wizard", notes: "fl", displayOrder: 0 });
  expect(copyImage).toHaveBeenCalledWith("p1/r1/a.jpg", expect.stringMatching(/^p2\/r1new\/.+\.jpg$/));
  expect(addRoleImage).toHaveBeenCalledWith("r1new", expect.stringMatching(/^p2\/r1new\/.+\.jpg$/));
  expect(insertCostumeDesignCopy).toHaveBeenCalledWith({ productionId: "p2", roleId: "r1new", name: "Cloak", notes: "dn", displayOrder: 0 });
  expect(copyImage).toHaveBeenCalledWith("p1/designs/d1/b.jpg", expect.stringMatching(/^p2\/designs\/d1new\/.+\.jpg$/));
  expect(addCostumeDesignImage).toHaveBeenCalledWith("d1new", expect.stringMatching(/^p2\/designs\/d1new\/.+\.jpg$/));
  expect(out).toEqual({ productionId: "p2" });
});

test("copyDesignLayer still inserts the image row when the file copy fails (best-effort)", async () => {
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats", notes: null });
  createProduction.mockResolvedValue({ id: "p2" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Wizard", notes: null, display_order: 0 }]);
  insertRoleCopy.mockResolvedValue({ id: "r1new" });
  listRoleImagesForRoles.mockResolvedValue([{ id: "ri1", role_id: "r1", storage_path: "p1/r1/a.jpg" }]);
  addRoleImage.mockResolvedValue({});
  listCostumeDesigns.mockResolvedValue([]);
  copyImage.mockRejectedValue(new Error("missing object"));

  await copyDesignLayer({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });
  expect(addRoleImage).toHaveBeenCalledTimes(1); // row still created despite copy failure
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/data/production-copy.test.ts`
Expected: FAIL — `@/lib/data/production-copy` does not exist.

- [ ] **Step 3: Implement the copy engine**

Create `src/lib/data/production-copy.ts`:

```ts
import { getProductionByIdUnscoped, createProduction } from "@/lib/data/productions";
import { listRoles, insertRoleCopy } from "@/lib/data/roles";
import { listRoleImagesForRoles, addRoleImage } from "@/lib/data/role-images";
import { listCostumeDesigns, insertCostumeDesignCopy } from "@/lib/data/costume-designs";
import { listCostumeDesignImages, addCostumeDesignImage } from "@/lib/data/costume-design-images";
import { copyImage } from "@/lib/storage";
import { NotFoundError } from "@/lib/errors";

// Duplicate the DESIGN LAYER of a production into a new production owned by targetOrgId.
// Copies roles, role images, costume designs, and design images (image FILES duplicated to
// new paths). Never reads/writes performer-layer data (performers, casts, castings, pieces,
// measurements). A per-file copy failure is swallowed (logged); the image row is still made.
export async function copyDesignLayer(input: {
  sourceProductionId: string;
  targetOrgId: string;
  userId: string;
}): Promise<{ productionId: string }> {
  const src = await getProductionByIdUnscoped(input.sourceProductionId);
  if (!src) throw new NotFoundError("Production not found");

  const newProd = await createProduction({
    orgId: input.targetOrgId,
    createdBy: input.userId,
    title: src.title,
    notes: src.notes,
  });

  const roles = await listRoles(input.sourceProductionId);
  const roleIdMap = new Map<string, string>();
  for (const role of roles) {
    const copy = await insertRoleCopy({
      productionId: newProd.id,
      name: role.name,
      notes: role.notes,
      displayOrder: role.display_order,
    });
    roleIdMap.set(role.id, copy.id);
  }

  const roleImages = await listRoleImagesForRoles(roles.map((r) => r.id));
  for (const img of roleImages) {
    const newRoleId = roleIdMap.get(img.role_id);
    if (!newRoleId) continue;
    const newPath = `${newProd.id}/${newRoleId}/${crypto.randomUUID()}.jpg`;
    try {
      await copyImage(img.storage_path, newPath);
    } catch (e) {
      console.error("Share copy: role image copy failed", e);
    }
    await addRoleImage(newRoleId, newPath);
  }

  const designs = await listCostumeDesigns(input.sourceProductionId);
  for (const design of designs) {
    const newRoleId = roleIdMap.get(design.role_id);
    if (!newRoleId) continue;
    const copy = await insertCostumeDesignCopy({
      productionId: newProd.id,
      roleId: newRoleId,
      name: design.name,
      notes: design.notes,
      displayOrder: design.display_order,
    });
    const images = await listCostumeDesignImages(design.id);
    for (const img of images) {
      const newPath = `${newProd.id}/designs/${copy.id}/${crypto.randomUUID()}.jpg`;
      try {
        await copyImage(img.storage_path, newPath);
      } catch (e) {
        console.error("Share copy: design image copy failed", e);
      }
      await addCostumeDesignImage(copy.id, newPath);
    }
  }

  return { productionId: newProd.id };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/data/production-copy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/production-copy.ts src/lib/data/production-copy.test.ts
git commit -m "feat(data): copyDesignLayer duplicates a production's design layer"
```

---

### Task 4: Share records — `production-shares.ts` CRUD

**Files:**
- Create: `src/lib/data/production-shares.ts`
- Test: `src/lib/data/production-shares.test.ts`

**Interfaces:**
- Consumes: `getProductionByIdUnscoped` (Task 2), `listRoles`, `listCostumeDesigns`.
- Produces: `ProductionShare` interface; `createProductionShare`, `getShareRowByToken`, `getShareByToken`, `listSharesForProduction`, `revokeShare` (signatures below). (Task 5 adds `acceptProductionShare` + `markShareAccepted` to this file.)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/production-shares.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "eq", "order"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

const getProductionByIdUnscoped = vi.fn();
vi.mock("@/lib/data/productions", () => ({ getProductionByIdUnscoped: (...a: unknown[]) => getProductionByIdUnscoped(...a) }));
const listRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({ listRoles: (...a: unknown[]) => listRoles(...a) }));
const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));

import {
  createProductionShare, getShareByToken, listSharesForProduction, revokeShare,
} from "@/lib/data/production-shares";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  [from, getProductionByIdUnscoped, listRoles, listCostumeDesigns].forEach((m) => m.mockReset?.());
  from.mockImplementation((_t: string) => chain);
  setResult(null, null);
});

test("createProductionShare inserts a pending row with a token", async () => {
  setResult({ id: "s1", token: "abc", status: "pending" });
  await createProductionShare({ sourceProductionId: "p1", sourceOrgId: "orgA", userId: "u1", recipientEmail: "x@y.com" });
  expect(from).toHaveBeenCalledWith("production_shares");
  expect(chain.insert).toHaveBeenCalledWith(
    expect.objectContaining({ source_production_id: "p1", source_org_id: "orgA", created_by: "u1", recipient_email: "x@y.com", token: expect.any(String) }),
  );
});

test("getShareByToken returns the share plus a source summary", async () => {
  setResult({ id: "s1", source_production_id: "p1", token: "abc", status: "pending" });
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats" });
  listRoles.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
  const out = await getShareByToken("abc");
  expect(out?.source).toEqual({ title: "Cats", roleCount: 2, designCount: 1 });
});

test("getShareByToken returns null for an unknown token", async () => {
  setResult(null);
  expect(await getShareByToken("nope")).toBeNull();
});

test("listSharesForProduction filters by source production, newest first", async () => {
  setResult([{ id: "s1" }]);
  await listSharesForProduction("p1");
  expect(chain.eq).toHaveBeenCalledWith("source_production_id", "p1");
  expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
});

test("revokeShare updates status scoped by id, production, and pending", async () => {
  setResult(null);
  await revokeShare("p1", "s1");
  expect(chain.update).toHaveBeenCalledWith({ status: "revoked" });
  expect(chain.eq).toHaveBeenCalledWith("id", "s1");
  expect(chain.eq).toHaveBeenCalledWith("source_production_id", "p1");
  expect(chain.eq).toHaveBeenCalledWith("status", "pending");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/data/production-shares.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the share CRUD**

Create `src/lib/data/production-shares.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductionByIdUnscoped } from "@/lib/data/productions";
import { listRoles } from "@/lib/data/roles";
import { listCostumeDesigns } from "@/lib/data/costume-designs";

export interface ProductionShare {
  id: string;
  source_production_id: string;
  source_org_id: string;
  created_by: string;
  token: string;
  recipient_email: string | null;
  status: "pending" | "accepted" | "revoked";
  accepted_by_org_id: string | null;
  accepted_production_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

export async function createProductionShare(input: {
  sourceProductionId: string;
  sourceOrgId: string;
  userId: string;
  recipientEmail: string | null;
}): Promise<ProductionShare> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .insert({
      source_production_id: input.sourceProductionId,
      source_org_id: input.sourceOrgId,
      created_by: input.userId,
      token,
      recipient_email: input.recipientEmail,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProductionShare;
}

export async function getShareRowByToken(token: string): Promise<ProductionShare | null> {
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductionShare) ?? null;
}

// The recipient preview: the share row + a small summary of the source production.
export async function getShareByToken(token: string): Promise<{
  share: ProductionShare;
  source: { title: string; roleCount: number; designCount: number };
} | null> {
  const share = await getShareRowByToken(token);
  if (!share) return null;
  const [src, roles, designs] = await Promise.all([
    getProductionByIdUnscoped(share.source_production_id),
    listRoles(share.source_production_id),
    listCostumeDesigns(share.source_production_id),
  ]);
  return {
    share,
    source: { title: src?.title ?? "Production", roleCount: roles.length, designCount: designs.length },
  };
}

export async function listSharesForProduction(productionId: string): Promise<ProductionShare[]> {
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .select("*")
    .eq("source_production_id", productionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionShare[];
}

// Revoke a still-pending share (no effect once accepted/revoked).
export async function revokeShare(productionId: string, shareId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("production_shares")
    .update({ status: "revoked" })
    .eq("id", shareId)
    .eq("source_production_id", productionId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/data/production-shares.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/production-shares.ts src/lib/data/production-shares.test.ts
git commit -m "feat(data): production share records (create/get/list/revoke)"
```

---

### Task 5: Accept engine — `acceptProductionShare`

**Files:**
- Modify: `src/lib/data/production-shares.ts` (add `markShareAccepted`, `acceptProductionShare`)
- Test: `src/lib/data/production-shares.test.ts` (extend)

**Interfaces:**
- Consumes: `getShareRowByToken` (Task 4), `copyDesignLayer` (Task 3).
- Produces: `acceptProductionShare(input: { token: string; recipientOrgId: string; userId: string }): Promise<{ productionId: string }>` — validates the token is `pending`, copies the design layer into `recipientOrgId`, marks the share accepted. Throws `ValidationError` on a used/revoked/missing token.

- [ ] **Step 1: Add the `copyDesignLayer` mock and failing tests**

In `src/lib/data/production-shares.test.ts`, add the mock near the other `vi.mock` calls (top of file):

```ts
const copyDesignLayer = vi.fn();
vi.mock("@/lib/data/production-copy", () => ({ copyDesignLayer: (...a: unknown[]) => copyDesignLayer(...a) }));
```

Add `copyDesignLayer` to the `beforeEach` reset list (`[from, getProductionByIdUnscoped, listRoles, listCostumeDesigns, copyDesignLayer]`), add `acceptProductionShare` to the import from `@/lib/data/production-shares`, and append these tests:

```ts
test("acceptProductionShare copies the design layer and marks the share accepted", async () => {
  setResult({ id: "s1", source_production_id: "p1", status: "pending" });
  copyDesignLayer.mockResolvedValue({ productionId: "p2" });
  const out = await acceptProductionShare({ token: "abc", recipientOrgId: "orgB", userId: "u1" });
  expect(copyDesignLayer).toHaveBeenCalledWith({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });
  expect(chain.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "accepted", accepted_by_org_id: "orgB", accepted_production_id: "p2" }),
  );
  expect(out).toEqual({ productionId: "p2" });
});

test("acceptProductionShare rejects an already-accepted token without copying", async () => {
  const { ValidationError } = await import("@/lib/errors");
  setResult({ id: "s1", source_production_id: "p1", status: "accepted" });
  await expect(acceptProductionShare({ token: "abc", recipientOrgId: "orgB", userId: "u1" })).rejects.toBeInstanceOf(ValidationError);
  expect(copyDesignLayer).not.toHaveBeenCalled();
});

test("acceptProductionShare rejects an unknown token", async () => {
  const { ValidationError } = await import("@/lib/errors");
  setResult(null);
  await expect(acceptProductionShare({ token: "nope", recipientOrgId: "orgB", userId: "u1" })).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/data/production-shares.test.ts`
Expected: the three new tests FAIL — `acceptProductionShare` is not exported.

- [ ] **Step 3: Implement accept**

Append to `src/lib/data/production-shares.ts`:

```ts
import { ValidationError } from "@/lib/errors";
import { copyDesignLayer } from "@/lib/data/production-copy";

export async function markShareAccepted(shareId: string, input: {
  acceptedByOrgId: string;
  acceptedProductionId: string;
  acceptedAt: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("production_shares")
    .update({
      status: "accepted",
      accepted_by_org_id: input.acceptedByOrgId,
      accepted_production_id: input.acceptedProductionId,
      accepted_at: input.acceptedAt,
    })
    .eq("id", shareId);
  if (error) throw new Error(error.message);
}

// Single-use: copy the source design layer into recipientOrgId, then mark accepted.
export async function acceptProductionShare(input: {
  token: string;
  recipientOrgId: string;
  userId: string;
}): Promise<{ productionId: string }> {
  const share = await getShareRowByToken(input.token);
  if (!share || share.status !== "pending") {
    throw new ValidationError("This share link is no longer valid.");
  }
  const { productionId } = await copyDesignLayer({
    sourceProductionId: share.source_production_id,
    targetOrgId: input.recipientOrgId,
    userId: input.userId,
  });
  await markShareAccepted(share.id, {
    acceptedByOrgId: input.recipientOrgId,
    acceptedProductionId: productionId,
    acceptedAt: new Date().toISOString(),
  });
  return { productionId };
}
```

(Move the two `import` lines to the top of the file with the other imports; they're shown here next to the code they serve.)

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/data/production-shares.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/production-shares.ts src/lib/data/production-shares.test.ts
git commit -m "feat(data): acceptProductionShare copies once into the recipient org"
```

---

### Task 6: API routes — create/list/revoke/accept

**Files:**
- Create: `src/app/api/productions/[id]/shares/route.ts` (GET + POST)
- Create: `src/app/api/productions/[id]/shares/[shareId]/route.ts` (DELETE)
- Create: `src/app/api/shares/[token]/accept/route.ts` (POST)
- Test: `src/app/api/productions/[id]/shares/route.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdmin`/`getAuthContext`/`errorResponse`; `assertProductionInOrg`; `createProductionShare`/`listSharesForProduction`/`revokeShare`/`acceptProductionShare`; `sendEmail`.
- Produces: the four handlers.

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/productions/[id]/shares/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const requireOrgAdmin = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext(), requireOrgAdmin: () => requireOrgAdmin() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));

const createProductionShare = vi.fn();
const listSharesForProduction = vi.fn();
const revokeShare = vi.fn();
const acceptProductionShare = vi.fn();
vi.mock("@/lib/data/production-shares", () => ({
  createProductionShare: (...a: unknown[]) => createProductionShare(...a),
  listSharesForProduction: (...a: unknown[]) => listSharesForProduction(...a),
  revokeShare: (...a: unknown[]) => revokeShare(...a),
  acceptProductionShare: (...a: unknown[]) => acceptProductionShare(...a),
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { GET, POST } from "@/app/api/productions/[id]/shares/route";
import { DELETE } from "@/app/api/productions/[id]/shares/[shareId]/route";
import { POST as ACCEPT } from "@/app/api/shares/[token]/accept/route";

beforeEach(() => {
  [getAuthContext, requireOrgAdmin, assertProductionInOrg, createProductionShare, listSharesForProduction, revokeShare, acceptProductionShare, sendEmail].forEach((m) => m.mockReset());
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  sendEmail.mockResolvedValue({ sent: true });
});

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const shareCtx = (id: string, shareId: string) => ({ params: Promise.resolve({ id, shareId }) });
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
function postReq(body: unknown) {
  return new Request("http://test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("POST shares creates a share as an admin and returns the token", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  createProductionShare.mockResolvedValue({ id: "s1", token: "tok123" });
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(201);
  expect(createProductionShare).toHaveBeenCalledWith({ sourceProductionId: "p1", sourceOrgId: "orgA", userId: "u1", recipientEmail: null });
  expect(await res.json()).toMatchObject({ token: "tok123" });
});

test("POST shares emails the link best-effort and still 201 when email throws", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  createProductionShare.mockResolvedValue({ id: "s1", token: "tok123" });
  sendEmail.mockRejectedValue(new Error("no domain"));
  const res = await POST(postReq({ recipientEmail: "x@y.com" }), idCtx("p1"));
  expect(res.status).toBe(201);
  expect(createProductionShare).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: "x@y.com" }));
});

test("POST shares is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(403);
  expect(createProductionShare).not.toHaveBeenCalled();
});

test("GET shares lists shares for an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  listSharesForProduction.mockResolvedValue([{ id: "s1" }]);
  const res = await GET(new Request("http://test"), idCtx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ shares: [{ id: "s1" }] });
});

test("DELETE shares/[shareId] revokes as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  revokeShare.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), shareCtx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(revokeShare).toHaveBeenCalledWith("p1", "s1");
});

test("POST accept returns the new production id", async () => {
  getAuthContext.mockResolvedValue({ userId: "u9", orgId: "orgB" });
  acceptProductionShare.mockResolvedValue({ productionId: "p2" });
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(201);
  expect(acceptProductionShare).toHaveBeenCalledWith({ token: "tok123", recipientOrgId: "orgB", userId: "u9" });
  expect(await res.json()).toEqual({ productionId: "p2" });
});

test("POST accept 400 on a used token", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u9", orgId: "orgB" });
  acceptProductionShare.mockRejectedValue(new ValidationError("This share link is no longer valid."));
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(400);
});

test("POST accept 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run "src/app/api/productions/[id]/shares/route.test.ts"`
Expected: FAIL — the route modules don't exist.

- [ ] **Step 3: Implement the shares route (GET + POST)**

Create `src/app/api/productions/[id]/shares/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { createProductionShare, listSharesForProduction } from "@/lib/data/production-shares";
import { sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const shares = await listSharesForProduction(id);
    return NextResponse.json({ shares });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await requireOrgAdmin();
    const { id } = await params;
    const production = await assertProductionInOrg(orgId, id);
    const body = (await request.json().catch(() => ({}))) as { recipientEmail?: string };
    const recipientEmail = typeof body.recipientEmail === "string" && body.recipientEmail.trim() ? body.recipientEmail.trim() : null;
    const share = await createProductionShare({ sourceProductionId: id, sourceOrgId: orgId, userId, recipientEmail });

    if (recipientEmail) {
      const link = `${new URL(request.url).origin}/share/${share.token}`;
      try {
        await sendEmail({
          to: recipientEmail,
          subject: `A costume production was shared with you on Measure My Costume`,
          text: `You've been invited to copy the production "${production.title}" into your organization.\n\nOpen this link, sign in, and accept:\n${link}\n\nYou'll get roles, design notes, and idea photos — performers and measurements are not included.`,
        });
      } catch (e) {
        console.error("Share invite email failed (share still created):", e);
      }
    }
    return NextResponse.json({ share, token: share.token }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Implement the revoke route (DELETE)**

Create `src/app/api/productions/[id]/shares/[shareId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { revokeShare } from "@/lib/data/production-shares";

type Ctx = { params: Promise<{ id: string; shareId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id, shareId } = await params;
    await assertProductionInOrg(orgId, id);
    await revokeShare(id, shareId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Implement the accept route (POST)**

Create `src/app/api/shares/[token]/accept/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { acceptProductionShare } from "@/lib/data/production-shares";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await getAuthContext();
    const { token } = await params;
    const { productionId } = await acceptProductionShare({ token, recipientOrgId: orgId, userId });
    return NextResponse.json({ productionId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Run, verify pass + typecheck**

Run: `npx vitest run "src/app/api/productions/[id]/shares/route.test.ts" && npx tsc --noEmit`
Expected: PASS (8 tests); tsc clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/productions/[id]/shares/route.ts" "src/app/api/productions/[id]/shares/[shareId]/route.ts" "src/app/api/shares/[token]/accept/route.ts" "src/app/api/productions/[id]/shares/route.test.ts"
git commit -m "feat(api): production share create/list/revoke/accept routes"
```

---

### Task 7: Source UI — `SharePanel`

**Files:**
- Create: `src/components/SharePanel.tsx`
- Modify: `src/app/(app)/productions/[id]/page.tsx` (import `auth`, compute admin, mount the panel)

**Interfaces:**
- Consumes: `GET/POST /api/productions/[id]/shares`, `DELETE /api/productions/[id]/shares/[shareId]`.

- [ ] **Step 1: Create the component**

Create `src/components/SharePanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Share = { id: string; token: string; recipient_email: string | null; status: string; created_at: string };

export function SharePanel({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/productions/${productionId}/shares`, { credentials: "include" });
    if (res.ok) setShares(((await res.json()) as { shares: Share[] }).shares);
  }
  useEffect(() => {
    if (open && shares === null) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function linkFor(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientEmail: email || undefined }),
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't create the link.");
        return;
      }
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    try {
      await fetch(`/api/productions/${productionId}/shares/${shareId}`, { method: "DELETE", credentials: "include" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = (shares ?? []).filter((s) => s.status === "pending");

  return (
    <div className="surface mt-3 p-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="block text-left" aria-expanded="false">
          <span className="font-display text-xl font-semibold">Share production →</span>
          <span className="mt-0.5 block text-sm muted">Send a read-only copy (roles, designs, notes & photos — no performers)</span>
        </button>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setOpen(false)} className="block text-left font-display text-xl font-semibold" aria-expanded="true">
            Share production
          </button>
          <p className="text-sm muted">
            Creates a one-time link. The recipient signs in and copies this production&rsquo;s roles, costume designs,
            and their notes &amp; idea photos into their own organization. Performers and measurements are not shared.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field !p-1.5 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email the link (optional)"
              aria-label="Recipient email (optional)"
            />
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void create()}>
              Create share link
            </button>
          </div>
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}
          {pending.length > 0 && (
            <ul className="space-y-1 border-t border-[var(--field-line)] pt-2 text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="muted">{s.recipient_email ?? "Link"}</span>
                  <button
                    type="button"
                    className="link-muted text-xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(linkFor(s.token));
                      setCopied(s.id);
                    }}
                  >
                    {copied === s.id ? "Copied!" : "Copy link"}
                  </button>
                  <button type="button" className="link-muted text-xs" disabled={busy} onClick={() => void revoke(s.id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it (admin-only) on the production page**

In `src/app/(app)/productions/[id]/page.tsx`, add imports:

```tsx
import { auth } from "@clerk/nextjs/server";
import { SharePanel } from "@/components/SharePanel";
```

After the existing `const { orgId } = await getAuthContext();` line, add:

```tsx
  const { orgRole } = await auth();
  const isAdmin = orgRole === "org:admin";
```

Then render the panel immediately after the `<EditableProductionHeader ... />` element (it takes `productionId={id}`):

```tsx
        {isAdmin && <SharePanel productionId={id} />}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SharePanel.tsx "src/app/(app)/productions/[id]/page.tsx"
git commit -m "feat(share): admin SharePanel on the production page"
```

---

### Task 8: Recipient UI — `/share/[token]` page

**Files:**
- Create: `src/app/(app)/share/[token]/page.tsx` (server)
- Create: `src/components/AcceptShareButton.tsx` (client)

**Interfaces:**
- Consumes: `getShareByToken` (Task 4); `POST /api/shares/[token]/accept` (Task 6).

- [ ] **Step 1: Create the accept button (client)**

Create `src/components/AcceptShareButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptShareButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shares/${token}/accept`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const { productionId } = (await res.json()) as { productionId: string };
        router.push(`/productions/${productionId}`);
        return;
      }
      const status = res.status;
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(
        status === 403
          ? "Create or select an organization first, then accept."
          : msg ?? "Couldn't accept this share.",
      );
    } catch {
      setError("Couldn't accept this share.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void accept()}>
        Accept &amp; copy to my organization
      </button>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the recipient page (server)**

Create `src/app/(app)/share/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { getShareByToken } from "@/lib/data/production-shares";
import { AcceptShareButton } from "@/components/AcceptShareButton";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getShareByToken(token);

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/productions" className="link-muted text-sm">← Productions</Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">Shared production</h1>

      {!result || result.share.status === "revoked" ? (
        <p className="mt-4 text-sm muted">This share link is no longer valid.</p>
      ) : result.share.status === "accepted" ? (
        <p className="mt-4 text-sm muted">This share link has already been used.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="surface p-4">
            <p className="font-display text-xl font-semibold">{result.source.title}</p>
            <p className="mt-1 text-sm muted">
              {result.source.roleCount} role{result.source.roleCount === 1 ? "" : "s"} ·{" "}
              {result.source.designCount} costume design{result.source.designCount === 1 ? "" : "s"} · includes notes &amp; idea photos
            </p>
            <p className="mt-1 text-sm muted">Performers and measurements are not included.</p>
          </div>
          <p className="text-sm muted">
            Accepting copies this into your organization as a new production you can edit.
          </p>
          <AcceptShareButton token={token} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds (the page is in the authed `(app)` group, so Clerk handles sign-in/up before it renders).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/share/[token]/page.tsx" src/components/AcceptShareButton.tsx
git commit -m "feat(share): recipient accept page at /share/[token]"
```

---

## Final verification

- [ ] `npm test` — all suites pass.
- [ ] `npx tsc --noEmit && npm run build` — clean.
- [ ] Confirm migration `0027` was **not** applied to Supabase and nothing was pushed/deployed. Report to Chris that the work is on local `main` awaiting his green light to apply `0027` + push, and that the optional invite email needs `RESEND_API_KEY` + a verified domain (the share link works without it).

## Notes / out of scope

- **Pricing gates deferred:** "only paying orgs may share" (a check in the create route) and "recipient must subscribe to use the copy" (a check around accept) belong to the pricing project. Clean extension points exist in `POST shares` and `acceptProductionShare`.
- One-time copy only — no live sync; later source edits don't propagate.
- A received copy is a normal production and could itself be re-shared — acceptable.
- The recipient `/share/[token]` page relies on Clerk middleware for sign-in/up + active-org; the no-active-org case surfaces as a friendly 403 message on accept.
