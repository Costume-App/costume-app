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
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
}));

// ── chain.upsert resolves with the shared result by default ───────────────────
// (billing.test.ts uses .then on the chain; here upsert needs to resolve)
// Override: make upsert return a resolved promise with {data: null, error: null}
chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));

import { getOrCreateStripeCustomer, fulfillCheckoutSession } from "@/lib/data/stripe-billing";
import type Stripe from "stripe";

beforeEach(() => {
  billingConfigured = true;
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  Object.values(stripeMock).forEach((g) =>
    Object.values(g).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()),
  );
  setResult(null, null);
  // Restore upsert to resolve cleanly after mockClear
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Restore maybeSingle
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
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
