import { expect, test, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("stripe", () => ({
  default: vi.fn(function () { return {}; }),
}));

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
