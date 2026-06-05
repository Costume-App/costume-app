import { expect, test } from "vitest";
import { COSTUME_SOURCES, sourceLabel, DEFAULT_SOURCE, isCostumeSource } from "@/lib/costume-sources";

test("sources expose token + label and a make default", () => {
  expect(DEFAULT_SOURCE).toBe("make");
  expect(COSTUME_SOURCES.map((s) => s.token)).toEqual(["make", "on_hand", "shared"]);
  expect(sourceLabel("on_hand")).toBe("On hand");
  expect(sourceLabel("nope")).toBe("Make"); // unknown falls back to default label
});

test("isCostumeSource guards the union", () => {
  expect(isCostumeSource("shared")).toBe(true);
  expect(isCostumeSource("borrow")).toBe(false);
});
