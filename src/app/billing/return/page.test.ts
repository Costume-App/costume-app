import { expect, test, vi, beforeEach } from "vitest";

// ── Shared mock block (mirrors checkout/route.test.ts) ────────────────────────
let billingConfigured = true;
const stripeMock = {
  checkout: { sessions: { retrieve: vi.fn() } },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
}));

// ── Page-specific mocks ───────────────────────────────────────────────────────
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
  // Explicitly reset the 3-level-deep mock so tests don't bleed (the brief's 2-level
  // loop wouldn't reach it; we reset it directly to avoid cross-test bleed)
  stripeMock.checkout.sessions.retrieve.mockReset();
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
