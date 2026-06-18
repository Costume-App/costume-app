import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Shared Supabase mock ──────────────────────────────────────────────────────
const chain: Record<string, ReturnType<typeof vi.fn>> = {};
for (const m of ["select", "eq", "limit"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (_t: string) => chain } }));

// ── Shared mock block ─────────────────────────────────────────────────────────
let billingConfigured = true;
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
}));

// ── Route-specific mocks ──────────────────────────────────────────────────────
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
  Object.values(chain).forEach((f) => typeof f === "function" && (f as ReturnType<typeof vi.fn>).mockClear?.());
  // Restore chain methods to return chain after mockClear
  for (const m of ["select", "eq", "limit"]) {
    chain[m] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
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

test("no subscription row → nulls + hasStripeCustomer false", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  isUnlimited.mockResolvedValue(false);
  isPaidOrg.mockResolvedValue(false);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ isUnlimited: false, isPaidOrg: false, subscriptionStatus: null, hasStripeCustomer: false, billingConfigured: true });
});
