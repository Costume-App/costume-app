import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Shared Supabase mock ──────────────────────────────────────────────────────
const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "upsert", "eq", "is", "in", "limit", "order"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
chain.single = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) {
  result.data = data;
  result.error = error;
}
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

// ── Shared Stripe mock ────────────────────────────────────────────────────────
let billingConfigured = true;
const stripeMock = {
  customers: { create: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
  PRICE_IDS: { unlock: "price_unlock", seat: "price_seat", unlimited: "price_unlimited" },
}));

// ── organizations mock (getOrCreateStripeCustomer ensures the FK-target row) ───
const ensureOrgRow = vi.fn();
vi.mock("@/lib/data/organizations", () => ({
  ensureOrgRow: (...a: unknown[]) => ensureOrgRow(...a),
}));

// ── chain.upsert resolves with the shared result by default ───────────────────
// (billing.test.ts uses .then on the chain; here upsert needs to resolve)
// Override: make upsert return a resolved promise with {data: null, error: null}
chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));

import { getOrCreateStripeCustomer, fulfillCheckoutSession, createCheckoutSession } from "@/lib/data/stripe-billing";
import type Stripe from "stripe";

beforeEach(() => {
  billingConfigured = true;
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  Object.values(stripeMock).forEach((g) =>
    Object.values(g).forEach((f) => {
      if (typeof f === "function") (f as ReturnType<typeof vi.fn>).mockReset?.();
      else if (typeof f === "object" && f !== null)
        Object.values(f as Record<string, unknown>).forEach((ff) => (ff as ReturnType<typeof vi.fn>).mockReset?.());
    }),
  );
  stripeMock.checkout.sessions.create.mockReset();
  setResult(null, null);
  // Restore upsert to resolve cleanly after mockClear
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Restore maybeSingle
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  ensureOrgRow.mockReset();
  ensureOrgRow.mockResolvedValue(undefined);
});

const sess = (o: Record<string, unknown>) => o as unknown as Stripe.Checkout.Session;

test("getOrCreateStripeCustomer returns the stored id without creating", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_existing" }, error: null }));
  const id = await getOrCreateStripeCustomer("orgA");
  expect(id).toBe("cus_existing");
  expect(stripeMock.customers.create).not.toHaveBeenCalled();
  expect(ensureOrgRow).not.toHaveBeenCalled();
});

test("getOrCreateStripeCustomer ensures the org row (FK target) before the billing write", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  stripeMock.customers.create.mockResolvedValue({ id: "cus_new" });
  const id = await getOrCreateStripeCustomer("orgA");
  expect(id).toBe("cus_new");
  // Ensures the organizations(clerk_org_id) FK-target row exists before the
  // org_subscriptions write (covers an org that hasn't created a production).
  expect(ensureOrgRow).toHaveBeenCalledWith("orgA");
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
  stripeMock.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", items: { data: [{ current_period_end: 4102444800 }] } });
  await fulfillCheckoutSession(sess({ id: "cs_3", mode: "subscription", customer: "cus_1", subscription: "sub_1", metadata: { orgId: "orgA", type: "unlimited" } }));
  expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
  const [payload, opts] = chain.upsert.mock.calls.at(-1)!;
  expect(payload).toMatchObject({ org_id: "orgA", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
  expect(payload).not.toHaveProperty("comped");
  expect(opts).toMatchObject({ onConflict: "org_id" });
});

import { applySubscriptionEvent } from "@/lib/data/stripe-billing";
type Sub = Stripe.Subscription;
const sub = (o: Record<string, unknown>) => o as unknown as Sub;

test("applySubscriptionEvent updates the row matched by subscription id", async () => {
  chain.select = vi.fn(() => chain); // update(...).eq(...).select() returns a matched row
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [{ org_id: "orgA" }], error: null });
  await applySubscriptionEvent(sub({ id: "sub_1", status: "active", items: { data: [{ current_period_end: 4102444800 }] }, metadata: { orgId: "orgA" } }));
  expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  expect(chain.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_1");
});

test("applySubscriptionEvent upserts by org when no row matched (event raced ahead)", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  await applySubscriptionEvent(sub({ id: "sub_2", status: "active", items: { data: [{ current_period_end: 4102444800 }] }, metadata: { orgId: "orgB" } }));
  expect(chain.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ org_id: "orgB", stripe_subscription_id: "sub_2", status: "active" }),
    expect.objectContaining({ onConflict: "org_id" }),
  );
});

test("applySubscriptionEvent records a canceled status", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [{ org_id: "orgA" }], error: null });
  await applySubscriptionEvent(sub({ id: "sub_1", status: "canceled", items: { data: [{ current_period_end: 4102444800 }] }, metadata: { orgId: "orgA" } }));
  expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
});

// ── createCheckoutSession unit tests ─────────────────────────────────────────

test("createCheckoutSession builds a one-time payment session for unlock and returns the url", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/x" });
  const url = await createCheckoutSession({ orgId: "orgA", type: "unlock", origin: "https://app" });
  expect(url).toBe("https://stripe/x");
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "payment", customer: "cus_1", metadata: { orgId: "orgA", type: "unlock" } });
  expect(params.line_items).toEqual([{ price: "price_unlock", quantity: 1 }]);
  expect(params.success_url).toBe("https://app/billing/return?session_id={CHECKOUT_SESSION_ID}");
  expect(params.cancel_url).toBe("https://app/productions");
});

test("createCheckoutSession uses subscription mode + metadata for unlimited", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/y" });
  await createCheckoutSession({ orgId: "orgA", type: "unlimited", origin: "https://app" });
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "subscription", subscription_data: { metadata: { orgId: "orgA" } } });
  expect(params.line_items).toEqual([{ price: "price_unlimited", quantity: 1 }]);
});

test("createCheckoutSession passes productionId metadata for a seat", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/z" });
  await createCheckoutSession({ orgId: "orgA", type: "seat", productionId: "prod1", origin: "https://app" });
  expect(stripeMock.checkout.sessions.create.mock.calls[0][0].metadata).toEqual({ orgId: "orgA", type: "seat", productionId: "prod1" });
});
