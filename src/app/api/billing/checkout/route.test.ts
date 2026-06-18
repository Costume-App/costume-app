import { expect, test, vi, beforeEach } from "vitest";

// ── Shared mock block ─────────────────────────────────────────────────────────
let billingConfigured = true;
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  PRICE_IDS: { unlock: "price_unlock", seat: "price_seat", unlimited: "price_unlimited" },
}));

// ── Route-specific mocks ──────────────────────────────────────────────────────
const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const createCheckoutSession = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a) }));
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));

import { POST } from "@/app/api/billing/checkout/route";

beforeEach(() => {
  billingConfigured = true;
  [getAuthContext, createCheckoutSession, assertProductionInOrg].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  createCheckoutSession.mockResolvedValue("https://stripe/checkout");
});
const req = (body: unknown) => new Request("https://www.measuremycostume.com/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("503 when billing isn't configured", async () => {
  billingConfigured = false;
  const res = await POST(req({ type: "unlock" }));
  expect(res.status).toBe(503);
  expect(createCheckoutSession).not.toHaveBeenCalled();
});

test("creates a one-time payment session for unlock", async () => {
  const res = await POST(req({ type: "unlock" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ url: "https://stripe/checkout" });
  expect(createCheckoutSession).toHaveBeenCalledWith(
    expect.objectContaining({ orgId: "orgA", type: "unlock", origin: "https://www.measuremycostume.com" }),
  );
});

test("creates a subscription session for unlimited with subscription metadata", async () => {
  const res = await POST(req({ type: "unlimited" }));
  expect(res.status).toBe(200);
  expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ type: "unlimited" }));
});

test("seat requires productionId and validates org ownership", async () => {
  const res = await POST(req({ type: "seat" }));
  expect(res.status).toBe(400);
  expect(createCheckoutSession).not.toHaveBeenCalled();
  assertProductionInOrg.mockResolvedValue({ id: "prod1" });
  const ok = await POST(req({ type: "seat", productionId: "prod1" }));
  expect(assertProductionInOrg).toHaveBeenCalledWith("orgA", "prod1");
  expect(ok.status).toBe(200);
  expect(createCheckoutSession).toHaveBeenCalledWith(
    expect.objectContaining({ type: "seat", productionId: "prod1" }),
  );
});

test("rejects an invalid type", async () => {
  const res = await POST(req({ type: "bogus" }));
  expect(res.status).toBe(400);
});
