import { expect, test } from "vitest";
import { ASSIGNMENTS, isAssignment, assignmentShortTag } from "@/lib/casting-assignment";

test("ASSIGNMENTS lists the three values", () => {
  expect(ASSIGNMENTS).toEqual(["primary", "understudy", "ensemble"]);
});

test("isAssignment accepts only known values", () => {
  expect(isAssignment("primary")).toBe(true);
  expect(isAssignment("understudy")).toBe(true);
  expect(isAssignment("ensemble")).toBe(true);
  expect(isAssignment("lead")).toBe(false);
  expect(isAssignment(undefined)).toBe(false);
});

test("assignmentShortTag labels non-primary rows", () => {
  expect(assignmentShortTag("primary")).toBe("");
  expect(assignmentShortTag("understudy")).toBe(" · u/s");
  expect(assignmentShortTag("ensemble")).toBe(" · ens");
});
