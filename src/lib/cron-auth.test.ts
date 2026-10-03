import { expect, test } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

test("accepts the matching bearer token", () => {
  expect(isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true);
});

test("rejects a wrong token", () => {
  expect(isAuthorizedCronRequest("Bearer nope", "s3cret")).toBe(false);
});

test("rejects a missing header", () => {
  expect(isAuthorizedCronRequest(null, "s3cret")).toBe(false);
});

test("fails closed when no secret is configured, even with an empty bearer", () => {
  expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
  expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
});

test("requires the Bearer scheme", () => {
  expect(isAuthorizedCronRequest("s3cret", "s3cret")).toBe(false);
});
