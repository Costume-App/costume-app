# Pricing Phase 2 — Stripe Checkout & Webhooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase-1 entitlements purchasable via Stripe — one-time Checkout for production unlocks ($49.99) and maker seats ($10), a $99/yr subscription for Unlimited, fulfilled idempotently by a webhook and a verify-on-return page, plus a Customer Portal and inline/org-area buy buttons.

**Architecture:** A thin `stripe.ts` (client + `isBillingConfigured`) and a `stripe-billing.ts` fulfillment layer write the **same Phase-1 rows** the enforcement already reads (`production_purchases`, `seat_purchases`, `org_subscriptions`). A single idempotent `fulfillCheckoutSession()` runs from both `POST /api/billing/webhook` and the `/billing/return` page, deduped by the unique `stripe_session_id`. UI buy buttons (`CheckoutButton`) POST `/api/billing/checkout` and redirect to Stripe; they degrade to "not set up" when env is absent.

**Tech Stack:** Next.js 16 (App Router, route handlers read raw body via `request.text()`), TypeScript strict, Supabase (`supabaseAdmin`), Clerk, Stripe Node SDK, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-pricing-phase2-stripe-design.md`. Builds on Phase-1 (`src/lib/data/billing.ts`, migration `0028`). **No new migration** — Phase-1 tables suffice.
- **Any org member** can purchase and manage billing → all billing routes use `getAuthContext` (NOT `requireOrgAdmin`).
- Three env price ids: `STRIPE_PRICE_UNLOCK` ($49.99 one-time), `STRIPE_PRICE_SEAT` ($10 one-time), `STRIPE_PRICE_UNLIMITED` ($99/yr recurring). Plus `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `isBillingConfigured()` = all five present. Checkout/portal/status routes 503 when false; UI buttons show "Checkout isn't set up yet."; gates fall back to coming-soon text. **Phase-1 enforcement + manual SQL grants keep working regardless.**
- Checkout types are exactly `'unlock' | 'seat' | 'unlimited'`. `seat` requires a `productionId` (validated with `assertProductionInOrg`).
- Fulfillment is **idempotent**: `production_purchases`/`seat_purchases` upsert `onConflict: "stripe_session_id", ignoreDuplicates: true`; `org_subscriptions` upsert `onConflict: "org_id"` and must **never overwrite `comped`** (only set the columns in the payload).
- `success_url = ${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = ${origin}/productions`, where `origin` is the request origin (canonical `https://www.measuremycostume.com` in prod).
- The **webhook route must be public** (Stripe has no Clerk session): add `/api/billing/webhook` to the `isPublic` matcher in `src/proxy.ts`. It is authenticated by the Stripe signature instead.
- Repo conventions: Vitest mock pattern from `src/lib/data/production-shares.test.ts` (chain object + `vi.mock("@/lib/supabase-admin", …)`); route-test pattern from `src/app/api/productions/route.test.ts` (mock `@/lib/auth-context` with `vi.importActual` spread). `npx vitest run <path>` focused, `npx vitest run` full, `npx tsc --noEmit`, `npm run build`, `npm run lint`. Local commits only — no push.

## Shared test mock (used by Tasks 2–7)

Tests for the billing layer/routes mock Stripe and Supabase like this:

```ts
import { expect, test, vi, beforeEach } from "vitest";

let billingConfigured = true;
const stripeMock = {
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  customers: { create: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
  PRICE_IDS: { unlock: "price_unlock", seat: "price_seat", unlimited: "price_unlimited" },
}));

// supabase chain (extend the method list per test as needed)
const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "upsert", "eq", "is", "in", "limit"]) chain[m] = vi.fn(() => chain);
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn(() => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => from() } }));
```

---

### Task 1: Stripe dependency, `stripe.ts`, env

**Files:**
- Modify: `package.json` (add `stripe`)
- Create: `src/lib/stripe.ts`
- Create: `src/lib/stripe.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `isBillingConfigured(): boolean`; `getStripe(): Stripe`; `PRICE_IDS: { unlock: string; seat: string; unlimited: string }`; `type CheckoutType = "unlock" | "seat" | "unlimited"`.

- [ ] **Step 1: Install the SDK**

Run: `npm install stripe`
Expected: `stripe` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `src/lib/stripe.test.ts`:

```ts
import { expect, test, beforeEach, afterEach, vi } from "vitest";

const ENV = { ...process.env };
beforeEach(() => { vi.resetModules(); process.env = { ...ENV }; });
afterEach(() => { process.env = { ...ENV }; });

test("isBillingConfigured is true only when all five vars are set", async () => {
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec",
    STRIPE_PRICE_UNLOCK: "price_u", STRIPE_PRICE_SEAT: "price_s", STRIPE_PRICE_UNLIMITED: "price_un",
  });
  const { isBillingConfigured } = await import("@/lib/stripe");
  expect(isBillingConfigured()).toBe(true);
});

test("isBillingConfigured is false when a var is missing", async () => {
  Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_test" });
  delete process.env.STRIPE_PRICE_UNLOCK;
  const { isBillingConfigured } = await import("@/lib/stripe");
  expect(isBillingConfigured()).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/stripe.test.ts`
Expected: FAIL — `@/lib/stripe` not found.

- [ ] **Step 4: Implement `stripe.ts`**

Create `src/lib/stripe.ts`:

```ts
import "server-only";
import Stripe from "stripe";

export type CheckoutType = "unlock" | "seat" | "unlimited";

export const PRICE_IDS = {
  unlock: process.env.STRIPE_PRICE_UNLOCK ?? "",
  seat: process.env.STRIPE_PRICE_SEAT ?? "",
  unlimited: process.env.STRIPE_PRICE_UNLIMITED ?? "",
} as const;

// True only when every Stripe var is present. Routes gate on this and 503 when
// false; the UI degrades to "checkout isn't set up yet."
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      PRICE_IDS.unlock &&
      PRICE_IDS.seat &&
      PRICE_IDS.unlimited,
  );
}

let client: Stripe | null = null;
// Lazily construct + memoize the SDK client. Callers must check isBillingConfigured first.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(key);
  return client;
}
```

> `PRICE_IDS` reads env at module load; the test uses `vi.resetModules()` + dynamic import so each case re-reads env. `new Stripe(key)` uses the account's default API version (no version string to churn).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/stripe.test.ts`
Expected: PASS.

- [ ] **Step 6: Document env**

Append to `.env.example`:

```
# Stripe (https://dashboard.stripe.com -> Developers -> API keys / Products)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_UNLOCK=
STRIPE_PRICE_SEAT=
STRIPE_PRICE_UNLIMITED=
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/stripe.ts src/lib/stripe.test.ts .env.example
git commit -m "feat(billing): add stripe SDK, stripe.ts (isBillingConfigured/getStripe/PRICE_IDS), env"
```

---

### Task 2: `stripe-billing.ts` — customer + `fulfillCheckoutSession`

**Files:**
- Create: `src/lib/data/stripe-billing.ts`
- Create: `src/lib/data/stripe-billing.test.ts`

**Interfaces:**
- Consumes: `getStripe`, `PRICE_IDS` from `@/lib/stripe`; `supabaseAdmin`.
- Produces:
  - `getOrCreateStripeCustomer(orgId: string): Promise<string>`
  - `getStripeCustomerId(orgId: string): Promise<string | null>`
  - `fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/stripe-billing.test.ts` (start with the **Shared test mock** block above, then):

```ts
import { getOrCreateStripeCustomer, fulfillCheckoutSession } from "@/lib/data/stripe-billing";
import type Stripe from "stripe";

beforeEach(() => {
  billingConfigured = true;
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  Object.values(stripeMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
  setResult(null, null);
});

const sess = (o: Record<string, unknown>) => o as unknown as Stripe.Checkout.Session;

test("getOrCreateStripeCustomer returns the stored id without creating", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_existing" }, error: null }));
  const id = await getOrCreateStripeCustomer("orgA");
  expect(id).toBe("cus_existing");
  expect(stripeMock.customers.create).not.toHaveBeenCalled();
});

test("getOrCreateStripeCustomer creates + upserts when none stored", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  stripeMock.customers.create.mockResolvedValue({ id: "cus_new" });
  const id = await getOrCreateStripeCustomer("orgA");
  expect(id).toBe("cus_new");
  expect(stripeMock.customers.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { orgId: "orgA" } }));
  expect(chain.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ org_id: "orgA", stripe_customer_id: "cus_new" }),
    expect.objectContaining({ onConflict: "org_id" }),
  );
});

test("fulfill unlock inserts an unbound production_purchases row, idempotent on session id", async () => {
  await fulfillCheckoutSession(sess({ id: "cs_1", mode: "payment", metadata: { orgId: "orgA", type: "unlock" } }));
  expect(from).toHaveBeenCalled();
  expect(chain.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ org_id: "orgA", stripe_session_id: "cs_1", source: "stripe" }),
    expect.objectContaining({ onConflict: "stripe_session_id", ignoreDuplicates: true }),
  );
});

test("fulfill seat inserts a seat_purchases row bound to the production", async () => {
  await fulfillCheckoutSession(sess({ id: "cs_2", mode: "payment", metadata: { orgId: "orgA", type: "seat", productionId: "prod1" } }));
  expect(chain.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ org_id: "orgA", production_id: "prod1", stripe_session_id: "cs_2", source: "stripe" }),
    expect.objectContaining({ onConflict: "stripe_session_id", ignoreDuplicates: true }),
  );
});

test("fulfill unlimited upserts org_subscriptions by org_id, preserving comped (not in payload)", async () => {
  stripeMock.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", current_period_end: 4102444800 });
  await fulfillCheckoutSession(sess({ id: "cs_3", mode: "subscription", customer: "cus_1", subscription: "sub_1", metadata: { orgId: "orgA", type: "unlimited" } }));
  expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
  const [payload, opts] = chain.upsert.mock.calls.at(-1)!;
  expect(payload).toMatchObject({ org_id: "orgA", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
  expect(payload).not.toHaveProperty("comped");
  expect(opts).toMatchObject({ onConflict: "org_id" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stripe-billing.ts` (Task-2 functions)**

Create `src/lib/data/stripe-billing.ts`:

```ts
import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";

export async function getStripeCustomerId(orgId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
}

// Reuse the org's Stripe customer, or create one and store its id WITHOUT
// touching comped/status (so a comped org stays comped).
export async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const existing = await getStripeCustomerId(orgId);
  if (existing) return existing;
  const customer = await getStripe().customers.create({ metadata: { orgId } });
  const { error } = await supabaseAdmin
    .from("org_subscriptions")
    .upsert(
      { org_id: orgId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) throw new Error(error.message);
  return customer.id;
}

// Idempotently grant the entitlement a completed Checkout session paid for.
// Safe to call from both the webhook and the return page (dedup on session id).
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orgId = session.metadata?.orgId;
  const type = session.metadata?.type;
  if (!orgId || !type) throw new Error("Checkout session missing orgId/type metadata");

  if (type === "unlock") {
    const { error } = await supabaseAdmin
      .from("production_purchases")
      .upsert(
        { org_id: orgId, stripe_session_id: session.id, source: "stripe" },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return;
  }
  if (type === "seat") {
    const productionId = session.metadata?.productionId;
    if (!productionId) throw new Error("Seat checkout session missing productionId");
    const { error } = await supabaseAdmin
      .from("seat_purchases")
      .upsert(
        { org_id: orgId, production_id: productionId, stripe_session_id: session.id, source: "stripe" },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return;
  }
  if (type === "unlimited") {
    const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
    const { error } = await supabaseAdmin.from("org_subscriptions").upsert(
      {
        org_id: orgId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        status: sub.status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error(`Unknown checkout type: ${type}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/stripe-billing.ts src/lib/data/stripe-billing.test.ts
git commit -m "feat(billing): stripe-billing customer + idempotent fulfillCheckoutSession"
```

---

### Task 3: `stripe-billing.ts` — `applySubscriptionEvent`

**Files:**
- Modify: `src/lib/data/stripe-billing.ts`
- Modify: `src/lib/data/stripe-billing.test.ts`

**Interfaces:**
- Produces: `applySubscriptionEvent(subscription: Stripe.Subscription): Promise<void>` — update `org_subscriptions` (status + current_period_end) matched by `stripe_subscription_id`; if no row matched and `subscription.metadata.orgId` is present, upsert by `org_id`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/stripe-billing.test.ts`:

```ts
import { applySubscriptionEvent } from "@/lib/data/stripe-billing";
type Sub = Stripe.Subscription;
const sub = (o: Record<string, unknown>) => o as unknown as Sub;

test("applySubscriptionEvent updates the row matched by subscription id", async () => {
  chain.select = vi.fn(() => chain); // update(...).eq(...).select() returns a matched row
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [{ org_id: "orgA" }], error: null });
  await applySubscriptionEvent(sub({ id: "sub_1", status: "active", current_period_end: 4102444800, metadata: { orgId: "orgA" } }));
  expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  expect(chain.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_1");
});

test("applySubscriptionEvent upserts by org when no row matched (event raced ahead)", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  await applySubscriptionEvent(sub({ id: "sub_2", status: "active", current_period_end: 4102444800, metadata: { orgId: "orgB" } }));
  expect(chain.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ org_id: "orgB", stripe_subscription_id: "sub_2", status: "active" }),
    expect.objectContaining({ onConflict: "org_id" }),
  );
});

test("applySubscriptionEvent records a canceled status", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [{ org_id: "orgA" }], error: null });
  await applySubscriptionEvent(sub({ id: "sub_1", status: "canceled", current_period_end: 4102444800, metadata: { orgId: "orgA" } }));
  expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: FAIL — `applySubscriptionEvent` not exported.

- [ ] **Step 3: Implement `applySubscriptionEvent`**

Append to `src/lib/data/stripe-billing.ts`:

```ts
// Keep org_subscriptions in sync with subscription lifecycle + renewal events.
export async function applySubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const update = {
    status: subscription.status,
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id)
    .select("org_id");
  if (error) throw new Error(error.message);
  if ((!data || (data as unknown[]).length === 0) && subscription.metadata?.orgId) {
    const { error: upErr } = await supabaseAdmin.from("org_subscriptions").upsert(
      { org_id: subscription.metadata.orgId, stripe_subscription_id: subscription.id, ...update },
      { onConflict: "org_id" },
    );
    if (upErr) throw new Error(upErr.message);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: PASS (all Task 2 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/stripe-billing.ts src/lib/data/stripe-billing.test.ts
git commit -m "feat(billing): applySubscriptionEvent for subscription lifecycle + renewals"
```

---

### Task 4: `POST /api/billing/checkout`

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/checkout/route.test.ts`

**Interfaces:**
- Consumes: `getAuthContext`; `isBillingConfigured`, `getStripe`, `PRICE_IDS` from `@/lib/stripe`; `getOrCreateStripeCustomer` from `@/lib/data/stripe-billing`; `assertProductionInOrg`.
- Produces: `POST` returning `{ url }` (200), 503 when unconfigured, 400 invalid type / missing productionId, 403 cross-org production.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/billing/checkout/route.test.ts` (Shared mock block, plus):

```ts
const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const getOrCreateStripeCustomer = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ getOrCreateStripeCustomer: (...a: unknown[]) => getOrCreateStripeCustomer(...a) }));
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));

import { POST } from "@/app/api/billing/checkout/route";

beforeEach(() => {
  billingConfigured = true;
  [getAuthContext, getOrCreateStripeCustomer, assertProductionInOrg].forEach((m) => m.mockReset());
  Object.values(stripeMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  getOrCreateStripeCustomer.mockResolvedValue("cus_1");
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/checkout" });
});
const req = (body: unknown) => new Request("https://www.measuremycostume.com/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("503 when billing isn't configured", async () => {
  billingConfigured = false;
  const res = await POST(req({ type: "unlock" }));
  expect(res.status).toBe(503);
  expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
});

test("creates a one-time payment session for unlock", async () => {
  const res = await POST(req({ type: "unlock" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ url: "https://stripe/checkout" });
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "payment", customer: "cus_1", metadata: { orgId: "orgA", type: "unlock" } });
  expect(params.line_items).toEqual([{ price: "price_unlock", quantity: 1 }]);
  expect(params.success_url).toContain("/billing/return?session_id={CHECKOUT_SESSION_ID}");
});

test("creates a subscription session for unlimited with subscription metadata", async () => {
  const res = await POST(req({ type: "unlimited" }));
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "subscription", subscription_data: { metadata: { orgId: "orgA" } } });
  expect(params.line_items).toEqual([{ price: "price_unlimited", quantity: 1 }]);
  expect(res.status).toBe(200);
});

test("seat requires productionId and validates org ownership", async () => {
  const res = await POST(req({ type: "seat" }));
  expect(res.status).toBe(400);
  assertProductionInOrg.mockResolvedValue({ id: "prod1" });
  const ok = await POST(req({ type: "seat", productionId: "prod1" }));
  expect(assertProductionInOrg).toHaveBeenCalledWith("orgA", "prod1");
  expect(ok.status).toBe(200);
});

test("rejects an invalid type", async () => {
  const res = await POST(req({ type: "bogus" }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/billing/checkout/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/billing/checkout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isBillingConfigured, getStripe, PRICE_IDS, type CheckoutType } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    if (!isBillingConfigured()) {
      return NextResponse.json({ error: "Billing isn't set up yet" }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as { type?: string; productionId?: string };
    const type = body.type as CheckoutType;
    if (type !== "unlock" && type !== "seat" && type !== "unlimited") {
      throw new ValidationError("Invalid checkout type");
    }
    if (type === "seat") {
      if (!body.productionId) throw new ValidationError("productionId is required for a seat");
      await assertProductionInOrg(orgId, body.productionId);
    }
    const customer = await getOrCreateStripeCustomer(orgId);
    const origin = new URL(request.url).origin;
    const session = await getStripe().checkout.sessions.create({
      mode: type === "unlimited" ? "subscription" : "payment",
      customer,
      line_items: [{ price: PRICE_IDS[type], quantity: 1 }],
      metadata: { orgId, type, ...(body.productionId ? { productionId: body.productionId } : {}) },
      ...(type === "unlimited" ? { subscription_data: { metadata: { orgId } } } : {}),
      success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/productions`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/billing/checkout/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/checkout/route.ts src/app/api/billing/checkout/route.test.ts
git commit -m "feat(billing): POST /api/billing/checkout (unlock/seat/unlimited sessions)"
```

---

### Task 5: `POST /api/billing/webhook` (+ make it public)

**Files:**
- Create: `src/app/api/billing/webhook/route.ts`
- Create: `src/app/api/billing/webhook/route.test.ts`
- Modify: `src/proxy.ts` (add `/api/billing/webhook` to `isPublic`)

**Interfaces:**
- Consumes: `isBillingConfigured`, `getStripe` from `@/lib/stripe`; `fulfillCheckoutSession`, `applySubscriptionEvent` from `@/lib/data/stripe-billing`.
- Produces: `POST` — 400 on bad signature, 200 on handled/unknown events.

- [ ] **Step 1: Add the webhook to the public matcher**

In `src/proxy.ts`, change the `isPublic` line to include the webhook (Stripe has no Clerk session):

```ts
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/preview(.*)", "/api/billing/webhook"]);
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/api/billing/webhook/route.test.ts` (Shared mock block, plus):

```ts
const fulfillCheckoutSession = vi.fn();
const applySubscriptionEvent = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({
  fulfillCheckoutSession: (...a: unknown[]) => fulfillCheckoutSession(...a),
  applySubscriptionEvent: (...a: unknown[]) => applySubscriptionEvent(...a),
}));

import { POST } from "@/app/api/billing/webhook/route";

beforeEach(() => {
  billingConfigured = true;
  [fulfillCheckoutSession, applySubscriptionEvent].forEach((m) => m.mockReset());
  Object.values(stripeMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
});
const req = () => new Request("https://www.measuremycostume.com/api/billing/webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: "{}" });

test("400 on bad signature", async () => {
  stripeMock.webhooks.constructEvent.mockImplementation(() => { throw new Error("bad sig"); });
  const res = await POST(req());
  expect(res.status).toBe(400);
  expect(fulfillCheckoutSession).not.toHaveBeenCalled();
});

test("checkout.session.completed → fulfillCheckoutSession", async () => {
  stripeMock.webhooks.constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(fulfillCheckoutSession).toHaveBeenCalledWith({ id: "cs_1" });
});

test("customer.subscription.deleted → applySubscriptionEvent", async () => {
  stripeMock.webhooks.constructEvent.mockReturnValue({ type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(applySubscriptionEvent).toHaveBeenCalledWith({ id: "sub_1" });
});

test("invoice.paid retrieves the subscription then applies it", async () => {
  stripeMock.webhooks.constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: { subscription: "sub_9" } } });
  stripeMock.subscriptions.retrieve.mockResolvedValue({ id: "sub_9" });
  const res = await POST(req());
  expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith("sub_9");
  expect(applySubscriptionEvent).toHaveBeenCalledWith({ id: "sub_9" });
  expect(res.status).toBe(200);
});

test("unknown event type → 200 no-op", async () => {
  stripeMock.webhooks.constructEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(fulfillCheckoutSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/billing/webhook/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 4: Implement the route**

Create `src/app/api/billing/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { fulfillCheckoutSession, applySubscriptionEvent } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up" }, { status: 503 });
  }
  const sig = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
        if (invoice.subscription) {
          const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
          await applySubscriptionEvent(sub);
        }
        break;
      }
      default:
        break; // ignore other event types
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", event.type, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
```

> Returning 500 on a handler error lets Stripe retry. Idempotency (Task 2/3) makes retries safe.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/billing/webhook/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/billing/webhook/route.ts src/app/api/billing/webhook/route.test.ts src/proxy.ts
git commit -m "feat(billing): POST /api/billing/webhook (public, signature-verified, idempotent dispatch)"
```

---

### Task 6: `/billing/return` verify-on-return page

**Files:**
- Create: `src/app/billing/return/page.tsx`
- Create: `src/app/billing/return/page.test.ts`

**Interfaces:**
- Consumes: `getAuthContext`; `isBillingConfigured`, `getStripe`; `fulfillCheckoutSession`. Uses Next `redirect`.
- Produces: default async page component; fulfills the session only when `metadata.orgId === orgId` and it's paid, then redirects to `/productions`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/billing/return/page.test.ts` (Shared mock block, plus):

```ts
const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const fulfillCheckoutSession = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ fulfillCheckoutSession: (...a: unknown[]) => fulfillCheckoutSession(...a) }));
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import Page from "@/app/billing/return/page";

beforeEach(() => {
  billingConfigured = true;
  [getAuthContext, fulfillCheckoutSession, redirect].forEach((m) => m.mockReset?.());
  redirect.mockImplementation((to: string) => { throw new Error(`REDIRECT:${to}`); });
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  Object.values(stripeMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
});
const run = (session_id?: string) => Page({ searchParams: Promise.resolve(session_id ? { session_id } : {}) });

test("fulfills a paid session for the caller's org, then redirects", async () => {
  stripeMock.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "paid", metadata: { orgId: "orgA", type: "unlock" } });
  await expect(run("cs_1")).rejects.toThrow("REDIRECT:/productions");
  expect(fulfillCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_1" }));
});

test("does NOT fulfill a session belonging to a different org", async () => {
  stripeMock.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_2", payment_status: "paid", metadata: { orgId: "orgOTHER", type: "unlock" } });
  await expect(run("cs_2")).rejects.toThrow("REDIRECT:/productions");
  expect(fulfillCheckoutSession).not.toHaveBeenCalled();
});

test("redirects without fulfilling when no session_id", async () => {
  await expect(run()).rejects.toThrow("REDIRECT:/productions");
  expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/billing/return/page.test.ts`
Expected: FAIL — page not found.

- [ ] **Step 3: Implement the page**

Create `src/app/billing/return/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { fulfillCheckoutSession } from "@/lib/data/stripe-billing";

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { session_id } = await searchParams;

  if (isBillingConfigured() && session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      const paid = session.payment_status === "paid" || session.status === "complete";
      if (paid && session.metadata?.orgId === orgId) {
        await fulfillCheckoutSession(session);
      }
    } catch (err) {
      // The webhook is the source of truth; if this best-effort verify fails, it still lands.
      console.error("Return-page fulfillment failed (webhook will cover it):", err);
    }
  }
  redirect("/productions");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/billing/return/page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/billing/return/page.tsx src/app/billing/return/page.test.ts
git commit -m "feat(billing): /billing/return verify-on-return fulfillment (org-scoped, idempotent)"
```

---

### Task 7: `POST /api/billing/portal` + `GET /api/billing/status`

**Files:**
- Create: `src/app/api/billing/portal/route.ts`
- Create: `src/app/api/billing/status/route.ts`
- Create: `src/app/api/billing/portal/route.test.ts`
- Create: `src/app/api/billing/status/route.test.ts`

**Interfaces:**
- Consumes: `getAuthContext`; `isBillingConfigured`, `getStripe`; `getStripeCustomerId` from `@/lib/data/stripe-billing`; `isUnlimited`, `isPaidOrg` from `@/lib/data/billing`; `supabaseAdmin`.
- Produces: portal `POST` → `{ url }` (200) / 400 (no customer) / 503; status `GET` → `{ isUnlimited, isPaidOrg, subscriptionStatus, hasStripeCustomer, billingConfigured }`.

- [ ] **Step 1: Write the failing tests (portal)**

Create `src/app/api/billing/portal/route.test.ts` (Shared mock block, plus):

```ts
const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const getStripeCustomerId = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ getStripeCustomerId: (...a: unknown[]) => getStripeCustomerId(...a) }));

import { POST } from "@/app/api/billing/portal/route";

beforeEach(() => {
  billingConfigured = true;
  [getAuthContext, getStripeCustomerId].forEach((m) => m.mockReset());
  Object.values(stripeMock).forEach((g) => Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
});
const req = () => new Request("https://www.measuremycostume.com/api/billing/portal", { method: "POST" });

test("400 when the org has no Stripe customer yet", async () => {
  getStripeCustomerId.mockResolvedValue(null);
  expect((await POST(req())).status).toBe(400);
});

test("returns a portal url when a customer exists", async () => {
  getStripeCustomerId.mockResolvedValue("cus_1");
  stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: "https://stripe/portal" });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ url: "https://stripe/portal" });
  expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1" }));
});
```

- [ ] **Step 2: Write the failing tests (status)**

Create `src/app/api/billing/status/route.test.ts` (Shared mock block, plus):

```ts
const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const isUnlimited = vi.fn();
const isPaidOrg = vi.fn();
vi.mock("@/lib/data/billing", () => ({ isUnlimited: (...a: unknown[]) => isUnlimited(...a), isPaidOrg: (...a: unknown[]) => isPaidOrg(...a) }));

import { GET } from "@/app/api/billing/status/route";

beforeEach(() => {
  billingConfigured = true;
  [getAuthContext, isUnlimited, isPaidOrg].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  isUnlimited.mockResolvedValue(false);
  isPaidOrg.mockResolvedValue(true);
});

test("reports plan status + customer presence", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { status: "active", stripe_customer_id: "cus_1" }, error: null }));
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ isUnlimited: false, isPaidOrg: true, subscriptionStatus: "active", hasStripeCustomer: true, billingConfigured: true });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/billing/portal/route.test.ts src/app/api/billing/status/route.test.ts`
Expected: FAIL — routes not found.

- [ ] **Step 4: Implement the portal route**

Create `src/app/api/billing/portal/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { getStripeCustomerId } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    if (!isBillingConfigured()) {
      return NextResponse.json({ error: "Billing isn't set up yet" }, { status: 503 });
    }
    const customerId = await getStripeCustomerId(orgId);
    if (!customerId) {
      return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
    }
    const origin = new URL(request.url).origin;
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/productions`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Implement the status route**

Create `src/app/api/billing/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isBillingConfigured } from "@/lib/stripe";
import { isUnlimited, isPaidOrg } from "@/lib/data/billing";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const [unlimited, paid] = await Promise.all([isUnlimited(orgId), isPaidOrg(orgId)]);
    const { data } = await supabaseAdmin
      .from("org_subscriptions")
      .select("status, stripe_customer_id")
      .eq("org_id", orgId)
      .maybeSingle();
    const row = data as { status: string | null; stripe_customer_id: string | null } | null;
    return NextResponse.json({
      isUnlimited: unlimited,
      isPaidOrg: paid,
      subscriptionStatus: row?.status ?? null,
      hasStripeCustomer: Boolean(row?.stripe_customer_id),
      billingConfigured: isBillingConfigured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/api/billing/portal/route.test.ts src/app/api/billing/status/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/billing/portal src/app/api/billing/status
git commit -m "feat(billing): portal + status routes"
```

---

### Task 8: `CheckoutButton` + wire the New Production gate

**Files:**
- Create: `src/components/CheckoutButton.tsx`
- Modify: `src/app/(app)/productions/new/page.tsx`

**Interfaces:**
- Produces: `<CheckoutButton type={"unlock"|"seat"|"unlimited"} productionId?={string} label={string} className?={string} />` — POSTs `/api/billing/checkout`, redirects to the returned `url`; shows "Checkout isn't set up yet." on 503.
- Consumes (gate page): `isBillingConfigured` from `@/lib/stripe`.

- [ ] **Step 1: Create `CheckoutButton`**

Create `src/components/CheckoutButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export function CheckoutButton({
  type,
  productionId,
  label,
  className,
}: {
  type: "unlock" | "seat" | "unlimited";
  productionId?: string;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, productionId }),
      });
      if (res.status === 503) {
        setMsg("Checkout isn't set up yet.");
        return;
      }
      if (!res.ok) {
        setMsg(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't start checkout.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setMsg("Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void go()} className={className ?? "btn-primary"}>
        {busy ? "Starting…" : label}
      </button>
      {msg && <p className="text-sm muted">{msg}</p>}
    </>
  );
}
```

- [ ] **Step 2: Wire the New Production gate**

In `src/app/(app)/productions/new/page.tsx`, add imports:

```tsx
import { isBillingConfigured } from "@/lib/stripe";
import { CheckoutButton } from "@/components/CheckoutButton";
```

Replace the disabled-button block (the `<div className="flex gap-3">` containing `Subscribe — coming soon` and `Back`) with a configured-aware version:

```tsx
        <p className="muted mb-4 text-sm">
          {isBillingConfigured() ? "Choose a plan to continue." : "Online checkout is coming soon."}
        </p>
        <div className="flex flex-wrap gap-3">
          {isBillingConfigured() ? (
            <>
              <CheckoutButton type="unlock" label="Buy this production — $49.99" />
              <CheckoutButton type="unlimited" label="Go Unlimited — $99/yr" className="btn-ghost" />
            </>
          ) : (
            <button type="button" disabled className="btn-primary flex-1 opacity-60">
              Subscribe — coming soon
            </button>
          )}
          <Link href="/productions" className="btn-ghost">
            Back
          </Link>
        </div>
```

(Remove the now-replaced standalone `<p className="muted mb-4 text-sm">Online checkout is coming soon.</p>` so the copy isn't duplicated.)

- [ ] **Step 3: Verify build + types**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (no test regressions).

- [ ] **Step 4: Commit**

```bash
git add src/components/CheckoutButton.tsx "src/app/(app)/productions/new/page.tsx"
git commit -m "feat(billing): CheckoutButton + real buy buttons on the New Production gate"
```

---

### Task 9: `PlanLimitNotice` checkout buttons + wire callers

**Files:**
- Modify: `src/components/PlanLimitNotice.tsx`
- Modify: `src/components/SharePanel.tsx`
- Modify: `src/components/MakePieceRow.tsx`
- Modify: `src/components/RoleCostumePanel.tsx`

**Interfaces:**
- Produces: `<PlanLimitNotice message={string} reason?={"needs_unlock"|"needs_seat"|"needs_paid_plan"} productionId?={string} />` — renders the message plus the matching `CheckoutButton`(s); with no `reason` it keeps today's message + "coming soon" line.

- [ ] **Step 1: Enhance `PlanLimitNotice`**

Replace `src/components/PlanLimitNotice.tsx` with:

```tsx
"use client";

import { CheckoutButton } from "@/components/CheckoutButton";

// Friendly subscribe-style prompt shown when an action is blocked by the org's
// plan (an HTTP 402). With a `reason`, it offers the matching checkout buttons;
// without one it falls back to the message + a "coming soon" note.
export function PlanLimitNotice({
  message,
  reason,
  productionId,
}: {
  message: string;
  reason?: "needs_unlock" | "needs_seat" | "needs_paid_plan";
  productionId?: string;
}) {
  return (
    <div className="surface space-y-2 p-3 text-sm">
      <p className="font-medium">{message}</p>
      {!reason && <p className="muted">Online checkout is coming soon.</p>}
      {reason === "needs_seat" && (
        <div className="flex flex-wrap gap-2">
          <CheckoutButton type="seat" productionId={productionId} label="Add a maker — $10" />
          <CheckoutButton type="unlimited" label="Go Unlimited — $99/yr" className="btn-ghost" />
        </div>
      )}
      {(reason === "needs_paid_plan" || reason === "needs_unlock") && (
        <div className="flex flex-wrap gap-2">
          <CheckoutButton type="unlock" label="Buy a production — $49.99" />
          <CheckoutButton type="unlimited" label="Go Unlimited — $99/yr" className="btn-ghost" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pass `reason` from the share gate**

In `src/components/SharePanel.tsx`, change the notice render to pass the reason:

```tsx
          {limitMsg && <PlanLimitNotice message={limitMsg} reason="needs_paid_plan" />}
```

- [ ] **Step 3: Pass `reason` + `productionId` from the maker gates**

In `src/components/MakePieceRow.tsx`, change the notice render:

```tsx
            {limitMsg && (
              <div className="col-span-full">
                <PlanLimitNotice message={limitMsg} reason="needs_seat" productionId={productionId} />
              </div>
            )}
```

In `src/components/RoleCostumePanel.tsx`, change the notice render:

```tsx
      {limitMsg && <PlanLimitNotice message={limitMsg} reason="needs_seat" productionId={productionId} />}
```

> Both components already receive `productionId` as a prop (used in their existing `fetch(`/api/productions/${productionId}/pieces`…)` calls), so it's in scope.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlanLimitNotice.tsx src/components/SharePanel.tsx src/components/MakePieceRow.tsx src/components/RoleCostumePanel.tsx
git commit -m "feat(billing): checkout buttons in PlanLimitNotice (seat / unlock / unlimited)"
```

---

### Task 10: `OrgBillingPanel` + "Plan & billing" tab

**Files:**
- Create: `src/components/OrgBillingPanel.tsx`
- Modify: `src/components/OrgSwitcher.tsx`

**Interfaces:**
- Consumes: `GET /api/billing/status`; `POST /api/billing/portal`; `CheckoutButton`.
- Produces: `OrgBillingPanel` + `BillingTabIcon`; an `OrganizationSwitcher.OrganizationProfilePage` labelled "Billing" mounted in `OrgSwitcher`.

- [ ] **Step 1: Create `OrgBillingPanel`**

Create `src/components/OrgBillingPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { CheckoutButton } from "@/components/CheckoutButton";

type Status = {
  isUnlimited: boolean;
  isPaidOrg: boolean;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  billingConfigured: boolean;
};

export function BillingTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

export function OrgBillingPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: Status) => active && setStatus(d))
      .catch(() => active && setError("Couldn't load billing."));
    return () => {
      active = false;
    };
  }, []);

  async function manage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't open billing.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-[var(--red)]">{error}</p>;
  if (!status) return <p className="text-sm muted">Loading…</p>;

  const planLabel = status.isUnlimited ? "Unlimited ($99/yr)" : status.isPaidOrg ? "Pay per production" : "No plan yet";

  return (
    <div className="space-y-4 text-sm">
      <div>
        <span className="lbl block">Current plan</span>
        <span className="font-medium">{planLabel}</span>
        {status.subscriptionStatus && status.subscriptionStatus !== "active" && (
          <span className="muted"> — {status.subscriptionStatus}</span>
        )}
      </div>
      {!status.billingConfigured && <p className="muted">Online checkout isn&rsquo;t set up yet.</p>}
      {status.billingConfigured && (
        <div className="flex flex-wrap gap-2">
          {!status.isUnlimited && <CheckoutButton type="unlimited" label="Go Unlimited — $99/yr" />}
          {status.hasStripeCustomer && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void manage()}>
              {busy ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount the tab in `OrgSwitcher`**

In `src/components/OrgSwitcher.tsx`, add the import and a third profile page:

```tsx
import { BillingTabIcon, OrgBillingPanel } from "@/components/OrgBillingPanel";
```

Add, alongside the existing Makers/Fabric `OrganizationProfilePage` children:

```tsx
      <OrganizationSwitcher.OrganizationProfilePage label="Billing" labelIcon={<BillingTabIcon />} url="billing">
        <OrgBillingPanel />
      </OrganizationSwitcher.OrganizationProfilePage>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/OrgBillingPanel.tsx src/components/OrgSwitcher.tsx
git commit -m "feat(billing): Plan & billing tab in the org area (status + upgrade + portal)"
```

---

### Task 11: Stripe runbook + full verification

**Files:**
- Create: `docs/billing-phase2-stripe-runbook.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Write the runbook**

Create `docs/billing-phase2-stripe-runbook.md`:

```markdown
# Billing Phase 2 — Stripe Setup Runbook

## Env (test mode locally, live in Vercel)
Set in `.env.local` and Vercel (all five required; `isBillingConfigured()` gates on them):
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_UNLOCK ($49.99 one-time), STRIPE_PRICE_SEAT ($10 one-time), STRIPE_PRICE_UNLIMITED ($99/yr recurring)

## Webhook
- Endpoint: `https://www.measuremycostume.com/api/billing/webhook` (public; verified by signature).
- Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.
- The signing secret from that endpoint is `STRIPE_WEBHOOK_SECRET`.
- Local testing: `stripe listen --forward-to localhost:3001/api/billing/webhook` (use the printed `whsec_…` as the local `STRIPE_WEBHOOK_SECRET`), then `stripe trigger checkout.session.completed`.

## Smoke test (test mode)
1. Fresh org with no plan → `/productions` → New Production → see the gate with real buy buttons.
2. "Buy this production — $49.99" → Stripe test card `4242 4242 4242 4242` → returns to `/billing/return` → redirects to `/productions` → New Production now shows the form.
3. "Go Unlimited" → completes → org is unlimited (no further gates).
4. Org area → Plan & billing → "Manage billing" opens the Stripe portal; cancel → subscription webhooks flip status.

## Notes
- Until env is set, checkout/portal 503 and buttons show "Checkout isn't set up yet."; Phase-1 manual SQL grants still work.
- Fulfillment is idempotent (webhook + return page dedupe on `stripe_session_id`); comped orgs are never overwritten.
```

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: PASS (all prior + new billing tests).

- [ ] **Step 3: Lint + type-check + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: lint 0 errors; tsc clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/billing-phase2-stripe-runbook.md
git commit -m "docs(billing): Phase 2 Stripe setup + smoke-test runbook"
```

---

## Self-Review

**Spec coverage:**
- `stripe.ts` (isBillingConfigured/getStripe/PRICE_IDS) → Task 1. ✓
- `stripe-billing.ts` (getOrCreateStripeCustomer, fulfillCheckoutSession, applySubscriptionEvent, getStripeCustomerId) → Tasks 2–3, 7. ✓
- Routes checkout / portal / webhook / status → Tasks 4, 7, 5, 7. ✓
- `/billing/return` verify-on-return → Task 6. ✓
- Webhook made public in `proxy.ts` → Task 5. ✓
- `CheckoutButton`, new-production gate, `PlanLimitNotice`, callers → Tasks 8–9. ✓
- `OrgBillingPanel` + org tab → Task 10. ✓
- Env + dependency + runbook → Tasks 1, 11. ✓
- Idempotency / comped-preservation / org-scoped return / any-member auth → encoded in Tasks 2, 6, and route auth (getAuthContext). ✓
- No migration (Phase-1 tables) → stated in Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; env blanks are values Chris fills (documented).

**Type consistency:** `CheckoutType`/`type` ∈ unlock|seat|unlimited across stripe.ts, checkout route, CheckoutButton, PlanLimitNotice. `fulfillCheckoutSession(session)` / `applySubscriptionEvent(subscription)` / `getStripeCustomerId(orgId)` / `getOrCreateStripeCustomer(orgId)` signatures consistent across Tasks 2–7. `/api/billing/status` shape matches `OrgBillingPanel`'s `Status` type. `PlanLimitNotice` props (`message`,`reason`,`productionId`) match all callers (Task 9).
```
