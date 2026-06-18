# Pricing & Plan Limits — Phase 1 (Model + Enforcement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the billing data model and a single billing service, and hard-enforce plan limits at the four request surfaces (create production, assign maker, share, accept) — without any Stripe code (that's Phase 2).

**Architecture:** Three Supabase tables (`org_subscriptions`, `production_purchases`, `seat_purchases`) feed one pure service module (`src/lib/data/billing.ts`). Routes never reason about plans directly — they call the service and throw a `PlanLimitError` that `errorResponse` maps to HTTP 402 with `{error, reason, plans}`. Phase 1 grants entitlements via manual SQL (`source='manual'`/`'comp'`); Stripe writes the same rows in Phase 2.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase (`supabaseAdmin` service-role client), Clerk auth, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-17-pricing-and-plan-limits-design.md`. Phase 1 ships **no Stripe code**.
- "Unlimited" = `org_subscriptions.comped = true` **OR** (`status` in `active`/`trialing` **AND** (`current_period_end` is null OR `> now`)).
- "User" counted against the 3-maker limit = **distinct non-null `maker_id`** across a production's costume pieces (pieces → `costume_designs.production_id`).
- All limit blocks return **HTTP 402** with body `{ error: string, reason: 'needs_unlock' | 'needs_seat' | 'needs_paid_plan', plans: PLANS }`.
- Plan prices (verbatim): pay-per-production **$49.99 one-time** (1 production, 3 makers); extra maker **$10 one-time**; unlimited **$99/year**.
- Follow the repo's Supabase mock pattern in tests (see `src/lib/data/production-shares.test.ts`): a single `chain` object whose methods return `chain`, terminal `.then` resolving a shared `result`, `vi.mock("@/lib/supabase-admin", ...)`.
- Run the full suite with `npx vitest run`. Type-check with `npx tsc --noEmit`. Build with `npm run build`.
- Local commits only — do **not** push or deploy (standing rule). Migration `0028` is applied to Supabase by Chris, not by an agent.

---

### Task 1: Billing migration `0028_billing.sql`

**Files:**
- Create: `supabase/migrations/0028_billing.sql`

**Interfaces:**
- Produces: tables `org_subscriptions(org_id PK, stripe_customer_id, stripe_subscription_id, status, current_period_end, comped, created_at, updated_at)`, `production_purchases(id, org_id, production_id, stripe_session_id, source, created_at)`, `seat_purchases(id, org_id, production_id, stripe_session_id, source, created_at)`. The data layer (Task 3/4) reads these column names.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0028_billing.sql`:

```sql
-- Pricing & plan limits (Phase 1). See docs/superpowers/specs/2026-06-17-pricing-and-plan-limits-design.md
-- org_subscriptions: the $99/yr unlimited plan, one row per org.
-- Unlimited == comped OR (status in active/trialing AND (current_period_end IS NULL OR > now())).
create table if not exists org_subscriptions (
  org_id                 text primary key references organizations(clerk_org_id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 text not null default 'inactive',
  current_period_end     timestamptz,
  comped                 boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- production_purchases: one row per $49.99 unlock. Unbound (production_id null)
-- until consumed by creating/accepting a production. on delete set null returns
-- the credit if the production is deleted.
create table if not exists production_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid references productions(id) on delete set null,
  stripe_session_id text unique,
  source            text not null default 'stripe',
  created_at        timestamptz not null default now()
);
create index if not exists production_purchases_org_idx  on production_purchases(org_id);
create index if not exists production_purchases_prod_idx on production_purchases(production_id);

-- seat_purchases: one row per $10 extra-maker seat, bound to a production.
create table if not exists seat_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid not null references productions(id) on delete cascade,
  stripe_session_id text unique,
  source            text not null default 'stripe',
  created_at        timestamptz not null default now()
);
create index if not exists seat_purchases_prod_idx on seat_purchases(production_id);
```

- [ ] **Step 2: Sanity-check the SQL references**

Confirm `organizations(clerk_org_id)` and `productions(id)` exist (grep prior migrations):
Run: `grep -rn "clerk_org_id\|create table if not exists productions" supabase/migrations/ | head`
Expected: both referenced columns/tables appear in earlier migrations.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_billing.sql
git commit -m "feat(billing): add 0028 billing schema (subscriptions, production/seat purchases)"
```

> **Operational note (Chris):** apply `0028` to Supabase before the enforcement routes are exercised against the real DB. Unit tests below mock the DB and do not require it.

---

### Task 2: `PlanLimitError`, `PLANS`, and 402 mapping

**Files:**
- Create: `src/lib/billing-plans.ts`
- Modify: `src/lib/errors.ts`
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts` (create if absent)

**Interfaces:**
- Produces: `PLANS` (static descriptor) from `@/lib/billing-plans`; `PlanLimitReason = 'needs_unlock' | 'needs_seat' | 'needs_paid_plan'` and `class PlanLimitError extends Error { reason: PlanLimitReason }` from `@/lib/errors`; `errorResponse(PlanLimitError)` → 402 `{ error, reason, plans: PLANS }`.
- Consumes: existing `errorResponse` from `@/lib/api`.

- [ ] **Step 1: Write the failing test**

Create/append `src/lib/api.test.ts`:

```ts
import { expect, test } from "vitest";
import { errorResponse } from "@/lib/api";
import { PlanLimitError } from "@/lib/errors";
import { PLANS } from "@/lib/billing-plans";

test("errorResponse maps PlanLimitError to 402 with reason and plans", async () => {
  const res = errorResponse(new PlanLimitError("needs_unlock"));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.reason).toBe("needs_unlock");
  expect(body.plans).toEqual(PLANS);
  expect(typeof body.error).toBe("string");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL — `PlanLimitError` / `PLANS` not exported.

- [ ] **Step 3: Add the `PLANS` descriptor**

Create `src/lib/billing-plans.ts`:

```ts
// Static, UI-facing descriptor of the paid plans. Safe to import anywhere
// (no DB, no secrets). Surfaced in 402 upgrade prompts.
export const PLANS = {
  perProduction: {
    id: "per_production",
    label: "Pay per production",
    price: "$49.99 one-time",
    includes: "1 production, 3 makers",
  },
  extraSeat: {
    id: "extra_seat",
    label: "Extra maker",
    price: "$10 one-time",
    includes: "1 more maker on this production",
  },
  unlimited: {
    id: "unlimited",
    label: "Unlimited",
    price: "$99/year",
    includes: "Unlimited productions & makers",
  },
} as const;

export type Plans = typeof PLANS;
```

- [ ] **Step 4: Add `PlanLimitError`**

Append to `src/lib/errors.ts`:

```ts
// Thrown when an action exceeds the org's plan entitlements; maps to HTTP 402.
export type PlanLimitReason = "needs_unlock" | "needs_seat" | "needs_paid_plan";

const PLAN_LIMIT_MESSAGES: Record<PlanLimitReason, string> = {
  needs_unlock: "This action needs a production unlock. Buy a production or upgrade to Unlimited.",
  needs_seat: "This production has reached its maker limit. Add a seat or upgrade to Unlimited.",
  needs_paid_plan: "Sharing requires a paid plan. Buy a production or upgrade to Unlimited.",
};

export class PlanLimitError extends Error {
  reason: PlanLimitReason;
  constructor(reason: PlanLimitReason, message?: string) {
    super(message ?? PLAN_LIMIT_MESSAGES[reason]);
    this.name = "PlanLimitError";
    this.reason = reason;
  }
}
```

- [ ] **Step 5: Map it in `errorResponse`**

In `src/lib/api.ts`, add the import and a branch (place the branch before the `ValidationError` branch):

```ts
import { ValidationError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { PLANS } from "@/lib/billing-plans";
```

```ts
  if (err instanceof PlanLimitError) {
    return NextResponse.json({ error: err.message, reason: err.reason, plans: PLANS }, { status: 402 });
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing-plans.ts src/lib/errors.ts src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(billing): PlanLimitError + PLANS descriptor + 402 mapping"
```

---

### Task 3: Billing service — subscription state & production-create gate

**Files:**
- Create: `src/lib/data/billing.ts`
- Test: `src/lib/data/billing.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/supabase-admin`.
- Produces (imported by routes and Task 4):
  - `isUnlimited(orgId: string): Promise<boolean>`
  - `isPaidOrg(orgId: string): Promise<boolean>`
  - `canCreateProduction(orgId: string): Promise<{ allowed: boolean; reason?: "needs_unlock"; unlimited: boolean }>`
  - `consumeProductionUnlock(orgId: string, productionId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/billing.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "eq", "is", "in", "limit", "order"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
chain.single = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { isUnlimited, isPaidOrg, canCreateProduction, consumeProductionUnlock } from "@/lib/data/billing";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockReset();
  from.mockImplementation((_t: string) => chain);
  setResult(null, null);
});

test("isUnlimited true when comped", async () => {
  setResult({ status: "inactive", current_period_end: null, comped: true });
  expect(await isUnlimited("orgA")).toBe(true);
});

test("isUnlimited true when active and not expired", async () => {
  setResult({ status: "active", current_period_end: "2999-01-01T00:00:00Z", comped: false });
  expect(await isUnlimited("orgA")).toBe(true);
});

test("isUnlimited false when active but expired", async () => {
  setResult({ status: "active", current_period_end: "2000-01-01T00:00:00Z", comped: false });
  expect(await isUnlimited("orgA")).toBe(false);
});

test("isUnlimited false when no row", async () => {
  setResult(null);
  expect(await isUnlimited("orgA")).toBe(false);
});

test("canCreateProduction allows unlimited orgs without an unlock", async () => {
  setResult({ status: "active", current_period_end: "2999-01-01T00:00:00Z", comped: false });
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: true, unlimited: true });
});

test("canCreateProduction allows when an unbound unlock exists", async () => {
  // 1st query (org_subscriptions) -> no sub; 2nd query (unbound unlocks) -> one row
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    return resolve(call === 1 ? { data: null, error: null } : { data: [{ id: "pp1" }], error: null });
  };
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: true, unlimited: false });
});

test("canCreateProduction blocks when no sub and no unlock", async () => {
  setResult([]); // sub query maybeSingle returns {data:null}; unlock query returns []
  setResult(null);
  // sub: maybeSingle -> null; unlocks: then -> []
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: false, reason: "needs_unlock", unlimited: false });
});

test("consumeProductionUnlock binds one unbound row and returns true", async () => {
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    // 1: select unbound -> [{id}], 2: update ... select -> [{id}]
    return resolve({ data: [{ id: "pp1" }], error: null });
  };
  const ok = await consumeProductionUnlock("orgA", "prod1");
  expect(ok).toBe(true);
  expect(chain.update).toHaveBeenCalledWith({ production_id: "prod1" });
  void call;
});

test("consumeProductionUnlock returns false when nothing to bind", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  expect(await consumeProductionUnlock("orgA", "prod1")).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/billing.test.ts`
Expected: FAIL — module `@/lib/data/billing` not found.

- [ ] **Step 3: Implement the service (Task-3 functions)**

Create `src/lib/data/billing.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
  comped: boolean;
}

// Unlimited == comped OR (active/trialing AND not expired).
export async function isUnlimited(orgId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("status, current_period_end, comped")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as SubscriptionRow | null;
  if (!row) return false;
  if (row.comped) return true;
  if (row.status === "active" || row.status === "trialing") {
    return !row.current_period_end || new Date(row.current_period_end) > new Date();
  }
  return false;
}

// Paying == unlimited OR has bought at least one production unlock.
export async function isPaidOrg(orgId: string): Promise<boolean> {
  if (await isUnlimited(orgId)) return true;
  const { data, error } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

export async function canCreateProduction(
  orgId: string,
): Promise<{ allowed: boolean; reason?: "needs_unlock"; unlimited: boolean }> {
  if (await isUnlimited(orgId)) return { allowed: true, unlimited: true };
  const { data, error } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .is("production_id", null)
    .limit(1);
  if (error) throw new Error(error.message);
  const has = ((data as unknown[] | null)?.length ?? 0) > 0;
  return has
    ? { allowed: true, unlimited: false }
    : { allowed: false, reason: "needs_unlock", unlimited: false };
}

// Atomically bind one unbound unlock to a production. Race-safe: the update's
// `.is("production_id", null)` guard means only one concurrent caller wins.
export async function consumeProductionUnlock(orgId: string, productionId: string): Promise<boolean> {
  const { data: rows, error: selErr } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .is("production_id", null)
    .limit(1);
  if (selErr) throw new Error(selErr.message);
  const id = (rows as { id: string }[] | null)?.[0]?.id;
  if (!id) return false;
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("production_purchases")
    .update({ production_id: productionId })
    .eq("id", id)
    .is("production_id", null)
    .select("id");
  if (updErr) throw new Error(updErr.message);
  return ((updated as unknown[] | null)?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/billing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/billing.ts src/lib/data/billing.test.ts
git commit -m "feat(billing): subscription state + production-create gate service"
```

---

### Task 4: Billing service — seat cap & maker-assignment gate

**Files:**
- Modify: `src/lib/data/billing.ts`
- Modify: `src/lib/data/billing.test.ts`

**Interfaces:**
- Consumes: `isUnlimited` (Task 3), `supabaseAdmin`.
- Produces:
  - `productionMakerIds(productionId: string): Promise<Set<string>>`
  - `productionSeatCap(orgId: string, productionId: string): Promise<number>` (`Infinity` if unlimited; else `3 + seat_purchases`)
  - `canAssignMakerToProduction(orgId: string, productionId: string, makerId: string): Promise<{ allowed: boolean; reason?: "needs_seat" }>`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/billing.test.ts`:

```ts
import { productionMakerIds, productionSeatCap, canAssignMakerToProduction } from "@/lib/data/billing";

test("productionMakerIds returns distinct non-null maker ids", async () => {
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    // 1: designs -> [{id:d1},{id:d2}], 2: pieces -> maker rows
    if (call === 1) return resolve({ data: [{ id: "d1" }, { id: "d2" }], error: null });
    return resolve({ data: [{ maker_id: "m1" }, { maker_id: "m1" }, { maker_id: null }, { maker_id: "m2" }], error: null });
  };
  const ids = await productionMakerIds("prod1");
  expect([...ids].sort()).toEqual(["m1", "m2"]);
});

test("productionSeatCap is 3 + seat purchases for a non-unlimited org", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null })); // not unlimited
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) =>
    resolve({ data: [{ id: "s1" }, { id: "s2" }], error: null }); // 2 seat purchases
  expect(await productionSeatCap("orgA", "prod1")).toBe(5);
});

test("productionSeatCap is Infinity for unlimited orgs", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { status: "active", current_period_end: "2999-01-01T00:00:00Z", comped: false }, error: null }));
  expect(await productionSeatCap("orgA", "prod1")).toBe(Infinity);
});

test("canAssignMaker allows an already-assigned maker even at cap", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null })); // not unlimited
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    if (call === 1) return resolve({ data: [{ id: "d1" }], error: null });               // designs
    return resolve({ data: [{ maker_id: "m1" }, { maker_id: "m2" }, { maker_id: "m3" }], error: null }); // makers (at cap 3)
  };
  const gate = await canAssignMakerToProduction("orgA", "prod1", "m2");
  expect(gate).toEqual({ allowed: true });
});

test("canAssignMaker blocks a new maker at cap", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    if (call === 1) return resolve({ data: [{ id: "d1" }], error: null });                 // designs (makerIds query #1)
    if (call === 2) return resolve({ data: [{ maker_id: "m1" }, { maker_id: "m2" }, { maker_id: "m3" }], error: null }); // makers
    return resolve({ data: [], error: null });                                             // seat_purchases -> cap 3
  };
  const gate = await canAssignMakerToProduction("orgA", "prod1", "m4");
  expect(gate).toEqual({ allowed: false, reason: "needs_seat" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/billing.test.ts`
Expected: FAIL — `productionMakerIds` / `productionSeatCap` / `canAssignMakerToProduction` not exported.

- [ ] **Step 3: Implement the Task-4 functions**

Append to `src/lib/data/billing.ts`:

```ts
// Distinct non-null maker ids across a production's costume pieces.
export async function productionMakerIds(productionId: string): Promise<Set<string>> {
  const { data: designs, error: dErr } = await supabaseAdmin
    .from("costume_designs")
    .select("id")
    .eq("production_id", productionId);
  if (dErr) throw new Error(dErr.message);
  const designIds = ((designs as { id: string }[] | null) ?? []).map((d) => d.id);
  if (designIds.length === 0) return new Set();
  const { data: pieces, error: pErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("maker_id")
    .in("costume_design_id", designIds);
  if (pErr) throw new Error(pErr.message);
  const ids = ((pieces as { maker_id: string | null }[] | null) ?? [])
    .map((p) => p.maker_id)
    .filter((m): m is string => Boolean(m));
  return new Set(ids);
}

async function seatPurchaseCount(productionId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("seat_purchases")
    .select("id")
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
  return (data as unknown[] | null)?.length ?? 0;
}

export async function productionSeatCap(orgId: string, productionId: string): Promise<number> {
  if (await isUnlimited(orgId)) return Infinity;
  return 3 + (await seatPurchaseCount(productionId));
}

export async function canAssignMakerToProduction(
  orgId: string,
  productionId: string,
  makerId: string,
): Promise<{ allowed: boolean; reason?: "needs_seat" }> {
  if (await isUnlimited(orgId)) return { allowed: true };
  const makerIds = await productionMakerIds(productionId);
  if (makerIds.has(makerId)) return { allowed: true };
  const cap = 3 + (await seatPurchaseCount(productionId));
  if (makerIds.size < cap) return { allowed: true };
  return { allowed: false, reason: "needs_seat" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/billing.test.ts`
Expected: PASS (all Task 3 + Task 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/billing.ts src/lib/data/billing.test.ts
git commit -m "feat(billing): seat cap + maker-assignment gate service"
```

---

### Task 5: Enforce create-production and accept-share

**Files:**
- Modify: `src/app/api/productions/route.ts`
- Modify: `src/app/api/shares/[token]/accept/route.ts`
- Test: `src/app/api/productions/route.test.ts` (create if absent)
- Test: `src/app/api/shares/[token]/accept/route.test.ts` (create if absent)

**Interfaces:**
- Consumes: `canCreateProduction`, `consumeProductionUnlock` from `@/lib/data/billing`; `PlanLimitError` from `@/lib/errors`; existing `createProduction`, `deleteProduction` from `@/lib/data/productions`; existing `acceptProductionShare`.

- [ ] **Step 1: Write the failing tests (create-production)**

Create `src/app/api/productions/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const listProductions = vi.fn();
const createProduction = vi.fn();
const deleteProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  listProductions: (...a: unknown[]) => listProductions(...a),
  createProduction: (...a: unknown[]) => createProduction(...a),
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
}));
const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: (...a: unknown[]) => ensureOrganization(...a) }));
const addShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({ addShowDate: (...a: unknown[]) => addShowDate(...a) }));
const createCast = vi.fn();
vi.mock("@/lib/data/casts", () => ({ createCast: (...a: unknown[]) => createCast(...a) }));

const canCreateProduction = vi.fn();
const consumeProductionUnlock = vi.fn();
vi.mock("@/lib/data/billing", () => ({
  canCreateProduction: (...a: unknown[]) => canCreateProduction(...a),
  consumeProductionUnlock: (...a: unknown[]) => consumeProductionUnlock(...a),
}));

import { POST } from "@/app/api/productions/route";

beforeEach(() => {
  [getAuthContext, listProductions, createProduction, deleteProduction, ensureOrganization, addShowDate, createCast, canCreateProduction, consumeProductionUnlock].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  ensureOrganization.mockResolvedValue(undefined);
  createCast.mockResolvedValue(undefined);
  createProduction.mockResolvedValue({ id: "prod1", title: "Cats" });
});

function postReq(body: unknown) {
  return new Request("http://test/api/productions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("blocks creation with 402 needs_unlock when not allowed", async () => {
  canCreateProduction.mockResolvedValue({ allowed: false, reason: "needs_unlock", unlimited: false });
  const res = await POST(postReq({ title: "Cats" }));
  expect(res.status).toBe(402);
  expect((await res.json()).reason).toBe("needs_unlock");
  expect(createProduction).not.toHaveBeenCalled();
});

test("creates and consumes an unlock for a non-unlimited org", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: false });
  consumeProductionUnlock.mockResolvedValue(true);
  const res = await POST(postReq({ title: "Cats" }));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).toHaveBeenCalledWith("orgA", "prod1");
  expect(deleteProduction).not.toHaveBeenCalled();
});

test("compensating-deletes and 402s if the unlock was claimed concurrently", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: false });
  consumeProductionUnlock.mockResolvedValue(false);
  const res = await POST(postReq({ title: "Cats" }));
  expect(res.status).toBe(402);
  expect(deleteProduction).toHaveBeenCalledWith("orgA", "prod1");
});

test("unlimited org creates without consuming an unlock", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: true });
  const res = await POST(postReq({ title: "Cats" }));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/productions/route.test.ts`
Expected: FAIL — route does not gate yet (createProduction called even when blocked).

- [ ] **Step 3: Add the gate to the create-production route**

In `src/app/api/productions/route.ts`, add imports:

```ts
import { canCreateProduction, consumeProductionUnlock } from "@/lib/data/billing";
import { deleteProduction } from "@/lib/data/productions";
import { PlanLimitError } from "@/lib/errors";
```

(Adjust the existing `createProduction`/`listProductions` import from `@/lib/data/productions` to also include `deleteProduction`.)

In `POST`, immediately after `const { userId, orgId } = await getAuthContext();` and `ensureOrganization`, before `createProduction`, insert the gate; then wrap consumption after creation:

```ts
    const gate = await canCreateProduction(orgId);
    if (!gate.allowed) throw new PlanLimitError("needs_unlock");
```

After the production (and its default cast + showings) are created, before the final `return`:

```ts
    if (!gate.unlimited) {
      const consumed = await consumeProductionUnlock(orgId, production.id);
      if (!consumed) {
        await deleteProduction(orgId, production.id);
        throw new PlanLimitError("needs_unlock");
      }
    }
```

> Place the `canCreateProduction` call after `ensureOrganization` so the org row exists; place `consumeProductionUnlock` after `createProduction` so a production id exists to bind.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/productions/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests (accept-share)**

Create `src/app/api/shares/[token]/accept/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const acceptProductionShare = vi.fn();
vi.mock("@/lib/data/production-shares", () => ({ acceptProductionShare: (...a: unknown[]) => acceptProductionShare(...a) }));
const canCreateProduction = vi.fn();
const consumeProductionUnlock = vi.fn();
vi.mock("@/lib/data/billing", () => ({
  canCreateProduction: (...a: unknown[]) => canCreateProduction(...a),
  consumeProductionUnlock: (...a: unknown[]) => consumeProductionUnlock(...a),
}));

import { POST } from "@/app/api/shares/[token]/accept/route";

const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = () => new Request("http://test/x", { method: "POST" });

beforeEach(() => {
  [getAuthContext, acceptProductionShare, canCreateProduction, consumeProductionUnlock].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgB" });
});

test("blocks accept with 402 when recipient cannot create a production", async () => {
  canCreateProduction.mockResolvedValue({ allowed: false, reason: "needs_unlock", unlimited: false });
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(402);
  expect(acceptProductionShare).not.toHaveBeenCalled();
});

test("accepts and consumes the recipient's unlock", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: false });
  acceptProductionShare.mockResolvedValue({ productionId: "newProd" });
  consumeProductionUnlock.mockResolvedValue(true);
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).toHaveBeenCalledWith("orgB", "newProd");
});

test("unlimited recipient accepts without consuming", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: true });
  acceptProductionShare.mockResolvedValue({ productionId: "newProd" });
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/shares/[token]/accept/route.test.ts"`
Expected: FAIL — route does not gate yet.

- [ ] **Step 7: Add the gate to the accept route**

Rewrite `src/app/api/shares/[token]/accept/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { acceptProductionShare } from "@/lib/data/production-shares";
import { canCreateProduction, consumeProductionUnlock } from "@/lib/data/billing";
import { PlanLimitError } from "@/lib/errors";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await getAuthContext();
    const { token } = await params;
    const gate = await canCreateProduction(orgId);
    if (!gate.allowed) throw new PlanLimitError("needs_unlock");
    const { productionId } = await acceptProductionShare({ token, recipientOrgId: orgId, userId });
    if (!gate.unlimited) {
      const consumed = await consumeProductionUnlock(orgId, productionId);
      if (!consumed) {
        // Non-atomic, same caveat as double-accept: the copy already landed.
        // Log and let it through rather than delete a freshly-copied production.
        console.error("Accepted share but no unlock to consume (race):", { orgId, productionId });
      }
    }
    return NextResponse.json({ productionId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/shares/[token]/accept/route.test.ts"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/productions/route.ts" "src/app/api/productions/route.test.ts" "src/app/api/shares/[token]/accept/route.ts" "src/app/api/shares/[token]/accept/route.test.ts"
git commit -m "feat(billing): enforce unlock on create-production and accept-share"
```

---

### Task 6: Enforce maker-assignment cap on the pieces PUT route

**Files:**
- Modify: `src/app/api/productions/[id]/pieces/route.ts`
- Test: `src/app/api/productions/[id]/pieces/route.test.ts`

**Interfaces:**
- Consumes: `canAssignMakerToProduction` from `@/lib/data/billing`; `PlanLimitError`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/productions/[id]/pieces/route.test.ts` (match the file's existing mock setup; add a `canAssignMakerToProduction` mock if not present):

```ts
// --- add near the other vi.mock calls ---
const canAssignMakerToProduction = vi.fn();
vi.mock("@/lib/data/billing", () => ({
  canAssignMakerToProduction: (...a: unknown[]) => canAssignMakerToProduction(...a),
}));

// --- add tests (ensure canAssignMakerToProduction.mockReset() runs in beforeEach,
//     and defaults to { allowed: true } so existing tests are unaffected) ---
test("PUT blocks assigning a maker beyond the cap with 402 needs_seat", async () => {
  // arrange a valid body that sets makerId; reuse the file's helpers/mocks for
  // getAuthContext, assertProductionInOrg, listCostumeDesigns, assertCastingInProduction
  canAssignMakerToProduction.mockResolvedValue({ allowed: false, reason: "needs_seat" });
  const res = await PUT(
    putReq({ designId: "d1", castingId: "c1", source: "make", makerId: "m4" }),
    idCtx("p1"),
  );
  expect(res.status).toBe(402);
  expect((await res.json()).reason).toBe("needs_seat");
});

test("PUT allows assigning a maker within the cap", async () => {
  canAssignMakerToProduction.mockResolvedValue({ allowed: true });
  const res = await PUT(
    putReq({ designId: "d1", castingId: "c1", source: "make", makerId: "m1" }),
    idCtx("p1"),
  );
  expect(res.status).toBe(200);
});
```

> If `putReq` / `idCtx` / the design+casting mocks don't already exist in this test file, add them mirroring `shares/route.test.ts` (`putReq` = a `PUT` Request with JSON body; `listCostumeDesigns` returns `[{ id: "d1" }]`; `assertCastingInProduction` resolves; `upsertPieceSource` resolves `{ id: "piece1" }`). Set `canAssignMakerToProduction.mockResolvedValue({ allowed: true })` in `beforeEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/route.test.ts"`
Expected: FAIL — no gate; the over-cap case returns 200.

- [ ] **Step 3: Add the gate**

In `src/app/api/productions/[id]/pieces/route.ts`, add imports:

```ts
import { canAssignMakerToProduction } from "@/lib/data/billing";
import { ValidationError } from "@/lib/errors"; // already imported; add PlanLimitError:
import { PlanLimitError } from "@/lib/errors";
```

(Combine into the existing `@/lib/errors` import.)

In `PUT`, after the `makerId` type validation and after `assertCastingInProduction`, before `upsertPieceSource`:

```ts
    if (body.makerId) {
      const seatGate = await canAssignMakerToProduction(orgId, id, body.makerId);
      if (!seatGate.allowed) throw new PlanLimitError("needs_seat");
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/pieces/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/pieces/route.ts" "src/app/api/productions/[id]/pieces/route.test.ts"
git commit -m "feat(billing): enforce per-production maker cap on piece assignment"
```

---

### Task 7: Enforce paid-plan gate on production sharing

**Files:**
- Modify: `src/app/api/productions/[id]/shares/route.ts`
- Test: `src/app/api/productions/[id]/shares/route.test.ts`

**Interfaces:**
- Consumes: `isPaidOrg` from `@/lib/data/billing`; `PlanLimitError`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/productions/[id]/shares/route.test.ts` (add an `isPaidOrg` mock; default it to `true` in `beforeEach` so existing tests pass):

```ts
// --- add near the other vi.mock calls ---
const isPaidOrg = vi.fn();
vi.mock("@/lib/data/billing", () => ({ isPaidOrg: (...a: unknown[]) => isPaidOrg(...a) }));

// --- add to beforeEach: isPaidOrg.mockReset(); isPaidOrg.mockReturnValue(true); ---
// (and add isPaidOrg to the array of mocks reset in beforeEach)

test("POST shares is blocked with 402 needs_paid_plan for an unpaid org", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  isPaidOrg.mockResolvedValue(false);
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(402);
  expect((await res.json()).reason).toBe("needs_paid_plan");
  expect(createProductionShare).not.toHaveBeenCalled();
});

test("POST shares is allowed for a paid org", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  isPaidOrg.mockResolvedValue(true);
  createProductionShare.mockResolvedValue({ id: "s1", token: "tok" });
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(201);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/shares/route.test.ts"`
Expected: FAIL — no paid gate; unpaid case returns 201.

- [ ] **Step 3: Add the gate**

In `src/app/api/productions/[id]/shares/route.ts`, add imports:

```ts
import { isPaidOrg } from "@/lib/data/billing";
import { PlanLimitError } from "@/lib/errors";
```

In `POST`, after `const production = await assertProductionInOrg(orgId, id);`, before `createProductionShare`:

```ts
    if (!(await isPaidOrg(orgId))) throw new PlanLimitError("needs_paid_plan");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/shares/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/shares/route.ts" "src/app/api/productions/[id]/shares/route.test.ts"
git commit -m "feat(billing): require a paid plan to share a production"
```

---

### Task 8: Operational runbook + full verification

**Files:**
- Create: `docs/billing-phase1-runbook.md`

**Interfaces:** none (docs + verification only).

- [ ] **Step 1: Write the runbook**

Create `docs/billing-phase1-runbook.md`:

```markdown
# Billing Phase 1 — Operational Runbook

Phase 1 enforces plan limits but has **no Stripe**. Entitlements are granted by SQL
in the Supabase SQL editor until Phase 2 wires Checkout/webhooks.

## Apply the migration
Apply `supabase/migrations/0028_billing.sql` to the shared Supabase project.

## Comp Nada's org (unlimited, free)
Find her Clerk org id (Clerk dashboard → Organizations), then:

    insert into org_subscriptions (org_id, status, comped)
    values ('<NADA_ORG_ID>', 'active', true)
    on conflict (org_id) do update set comped = true, status = 'active';

## Grant a production unlock for testing (simulates a $49.99 purchase)
    insert into production_purchases (org_id, source) values ('<ORG_ID>', 'manual');
-- Creating (or accepting) a production then binds this row to that production.

## Grant an extra maker seat on a production (simulates a $10 purchase)
    insert into seat_purchases (org_id, production_id, source)
    values ('<ORG_ID>', '<PRODUCTION_ID>', 'manual');

## Behaviour to expect
- No unlock + not comped/active  -> create production / accept share returns 402 needs_unlock.
- 4th distinct maker on a production at cap -> piece save returns 402 needs_seat.
- Unpaid org -> sharing returns 402 needs_paid_plan.
- Comped/unlimited org -> everything allowed, nothing consumed.
```

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: PASS (all prior tests + the new billing/route tests; no regressions).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add docs/billing-phase1-runbook.md
git commit -m "docs(billing): Phase 1 operational runbook (comp/manual-grant SQL)"
```

---

## Self-Review

**Spec coverage:**
- Data model (3 tables) → Task 1. ✓
- Billing service (`isUnlimited`, `isPaidOrg`, `canCreateProduction`, `consumeProductionUnlock`, `productionSeatCap`, maker count, `canAssignMakerToProduction`) → Tasks 3–4. ✓
- 402 + `{error, reason, plans}` → Task 2. ✓
- Enforcement: create production → Task 5; assign maker → Task 6; share → Task 7; accept → Task 5. ✓
- Policy: reassign-is-free & removal frees room (covered by `canAssignMaker` logic/tests, Task 4); delete returns credit (`on delete set null`, Task 1); comp Nada + manual unlock → Task 8. ✓
- Stripe (Phase 2) → intentionally excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 6/7 note where to mirror existing test helpers because those test files already exist — the added code is concrete.

**Type consistency:** `canCreateProduction` returns `{ allowed, reason?, unlimited }` and is consumed that way in Tasks 5. `canAssignMakerToProduction` returns `{ allowed, reason? }` (Task 4) consumed in Task 6. `PlanLimitError(reason)` signature consistent across Tasks 2/5/6/7. `consumeProductionUnlock(orgId, productionId): boolean` consistent Tasks 3/5.
