import { expect, test } from "vitest";
import {
  filterItemsByName,
  groupItemsByCategory,
  uniqueCategories,
  type InventoryRow,
} from "@/lib/inventory-grouping";

function row(partial: Partial<InventoryRow> & { id: string; name: string }): InventoryRow {
  return {
    category: null,
    size: null,
    quantity: 1,
    location: null,
    notes: null,
    ...partial,
  };
}

const ITEMS: InventoryRow[] = [
  row({ id: "1", name: "Top hat", category: "Hats" }),
  row({ id: "2", name: "Bowler", category: "hats" }), // different casing, same group
  row({ id: "3", name: "Gloves, white", category: "Hands" }),
  row({ id: "4", name: "Mystery prop" }), // no category
  row({ id: "5", name: "Apron", category: "  " }), // blank -> uncategorized
];

test("filterItemsByName: empty query returns all items unchanged", () => {
  expect(filterItemsByName(ITEMS, "")).toBe(ITEMS);
  expect(filterItemsByName(ITEMS, "   ")).toBe(ITEMS);
});

test("filterItemsByName: case-insensitive substring match on name", () => {
  const result = filterItemsByName(ITEMS, "hat");
  expect(result.map((i) => i.id)).toEqual(["1"]); // "Top hat" matches; "Hats" category does not
});

test("filterItemsByName: no matches returns empty array", () => {
  expect(filterItemsByName(ITEMS, "zzz")).toEqual([]);
});

test("groupItemsByCategory: groups by normalized category, uncategorized last", () => {
  const groups = groupItemsByCategory(ITEMS);
  expect(groups.map((g) => g.label)).toEqual(["Hands", "Hats", "Uncategorized"]);
  expect(groups.map((g) => g.key)).toEqual(["hands", "hats", ""]);
});

test("groupItemsByCategory: merges mixed-casing categories under first-seen label", () => {
  const hats = groupItemsByCategory(ITEMS).find((g) => g.key === "hats")!;
  expect(hats.label).toBe("Hats"); // first-seen casing
  expect(hats.items.map((i) => i.name)).toEqual(["Bowler", "Top hat"]); // sorted by name
});

test("groupItemsByCategory: blank and null categories share the Uncategorized group", () => {
  const uncat = groupItemsByCategory(ITEMS).find((g) => g.key === "")!;
  expect(uncat.items.map((i) => i.id).sort()).toEqual(["4", "5"]);
});

test("groupItemsByCategory: empty input returns empty array", () => {
  expect(groupItemsByCategory([])).toEqual([]);
});

test("uniqueCategories: distinct non-blank categories, sorted, first-seen casing", () => {
  expect(uniqueCategories(ITEMS)).toEqual(["Hands", "Hats"]);
});

test("uniqueCategories: empty when all uncategorized", () => {
  expect(uniqueCategories([row({ id: "x", name: "x" })])).toEqual([]);
});
