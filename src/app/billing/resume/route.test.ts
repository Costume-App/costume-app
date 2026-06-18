import { expect, test, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
let billingConfigured = true;
vi.mock("@/lib/stripe", () => ({ isBillingConfigured: () => billingConfigured }));
const createCheckoutSession = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a) }));

import { GET } from "@/app/billing/resume/route";

beforeEach(() => {
  billingConfigured = true;
  authMock.mockReset();
  createCheckoutSession.mockReset();
  authMock.mockResolvedValue({ orgId: "orgA" });
  createCheckoutSession.mockResolvedValue("https://stripe/checkout");
});

function reqWith(cookie?: string) {
  const r = new NextRequest("https://www.measuremycostume.com/billing/resume");
  if (cookie) r.cookies.set("checkout_intent", cookie);
  return r;
}

test("no cookie → redirect to /productions, no checkout", async () => {
  const res = await GET(reqWith());
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});

test("valid intent + configured → creates a session and redirects to Stripe, clears cookie", async () => {
  const res = await GET(reqWith("unlimited"));
  expect(createCheckoutSession).toHaveBeenCalledWith(
    expect.objectContaining({ orgId: "orgA", type: "unlimited", origin: "https://www.measuremycostume.com" }),
  );
  expect(res.headers.get("location")).toBe("https://stripe/checkout");
  // cookie cleared (maxAge 0 / empty value)
  expect(res.cookies.get("checkout_intent")?.value).toBe("");
});

test("billing not configured → /productions, no checkout", async () => {
  billingConfigured = false;
  const res = await GET(reqWith("unlimited"));
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});

test("invalid plan value → /productions, no checkout", async () => {
  const res = await GET(reqWith("bogus"));
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});
