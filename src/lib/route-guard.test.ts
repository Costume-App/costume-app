import { expect, test } from "vitest";
import { orgGate } from "@/lib/route-guard";

test("signed-in user with no active org is sent to onboarding", () => {
  expect(orgGate({ isOnboarding: false, orgId: null })).toEqual({
    type: "redirect",
    to: "/onboarding",
  });
});

test("org-less user already on onboarding is allowed through", () => {
  expect(orgGate({ isOnboarding: true, orgId: null })).toEqual({ type: "allow" });
});

test("user with an org sitting on onboarding is sent into the app", () => {
  expect(orgGate({ isOnboarding: true, orgId: "org_1" })).toEqual({
    type: "redirect",
    to: "/productions",
  });
});

test("user with an org on a normal route is allowed", () => {
  expect(orgGate({ isOnboarding: false, orgId: "org_1" })).toEqual({ type: "allow" });
});
