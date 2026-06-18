import { expect, test, vi, beforeEach } from "vitest";

// ── Shared mock block ─────────────────────────────────────────────────────────
let billingConfigured = true;
const stripeMock = {
  checkout: { sessions: { create: vi.fn() } },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
  PRICE_IDS: { unlock: "price_unlock", seat: "price_seat", unlimited: "price_unlimited" },
}));

// ── Route-specific mocks ──────────────────────────────────────────────────────
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
  // stripeMock is 3 levels deep (checkout.sessions.create) so we reset the leaf directly
  stripeMock.checkout.sessions.create.mockReset();
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
