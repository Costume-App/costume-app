import { expect, test } from "vitest";
import { COSTUME_SOURCES, sourceLabel, DEFAULT_SOURCE, isCostumeSource, defaultSourceFor } from "@/lib/costume-sources";

test("sources expose token + label and a make default", () => {
  expect(DEFAULT_SOURCE).toBe("make");
  expect(COSTUME_SOURCES.map((s) => s.token)).toEqual(["make", "on_hand", "shared", "purchase"]);
  expect(sourceLabel("on_hand")).toBe("On hand");
  expect(sourceLabel("purchase")).toBe("Purchase");
  expect(sourceLabel("nope")).toBe("Make"); // unknown falls back to default label
});

test("isCostumeSource guards the union", () => {
  expect(isCostumeSource("shared")).toBe(true);
  expect(isCostumeSource("purchase")).toBe(true);
  expect(isCostumeSource("borrow")).toBe(false);
});

test("defaultSourceFor returns make for an unlinked design", () => {
  expect(defaultSourceFor({ inventory_item_id: null })).toBe("make");
});

test("defaultSourceFor returns on_hand for an inventory-linked design", () => {
  expect(defaultSourceFor({ inventory_item_id: "i1" })).toBe("on_hand");
});
