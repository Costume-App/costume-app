import { expect, test, vi, beforeEach } from "vitest";

// ── Shared mock block ─────────────────────────────────────────────────────────
let billingConfigured = true;
const stripeMock = {
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
}));

// ── Route-specific mocks ──────────────────────────────────────────────────────
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
