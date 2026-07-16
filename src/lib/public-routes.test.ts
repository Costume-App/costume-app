import { expect, test } from "vitest";
import { PUBLIC_ROUTES } from "@/lib/public-routes";

test("legal pages are publicly reachable", () => {
  expect(PUBLIC_ROUTES).toContain("/terms");
  expect(PUBLIC_ROUTES).toContain("/privacy");
});

test("existing public routes are preserved", () => {
  for (const route of ["/sign-in(.*)", "/sign-up(.*)", "/get-started", "/api/billing/webhook"]) {
    expect(PUBLIC_ROUTES).toContain(route);
  }
});
