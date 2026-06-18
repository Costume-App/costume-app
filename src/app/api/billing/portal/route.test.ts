import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Shared mock block ─────────────────────────────────────────────────────────
let billingConfigured = true;
const stripeMock = {
  billingPortal: { sessions: { create: vi.fn() } },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
}));

// ── Route-specific mocks ──────────────────────────────────────────────────────
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
  Object.values(stripeMock).forEach((g) => Object.values(g as object).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset?.()));
  // 3-level-deep mock needs explicit reset — the loop above only goes 2 levels
  stripeMock.billingPortal.sessions.create.mockReset();
  stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: "https://stripe/portal" });
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgA" });
});
const req = () => new Request("https://www.measuremycostume.com/api/billing/portal", { method: "POST" });

test("503 when billing isn't configured", async () => {
  billingConfigured = false;
  const res = await POST(req());
  expect(res.status).toBe(503);
  expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
});

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
