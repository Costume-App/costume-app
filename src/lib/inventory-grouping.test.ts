import { expect, test } from "vitest";
import {
  attachInventoryPhotoUrls,
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

test("groupItemsByCategory: blank and null categories share the Uncategorized group, sorted by name", () => {
  const uncat = groupItemsByCategory(ITEMS).find((g) => g.key === "")!;
  // "Apron" (id 5) sorts before "Mystery prop" (id 4)
  expect(uncat.items.map((i) => i.id)).toEqual(["5", "4"]);
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

test("uniqueCategories: collapses 3+ casing variants to a single first-seen label", () => {
  const items = [
    row({ id: "a", name: "a", category: "HATS" }),
    row({ id: "b", name: "b", category: "hats" }),
    row({ id: "c", name: "c", category: "Hats" }),
  ];
  expect(uniqueCategories(items)).toEqual(["HATS"]);
});

test("attachInventoryPhotoUrls maps each item's first-photo path to its signed url", () => {
  const out = attachInventoryPhotoUrls(
    [row({ id: "1", name: "Top hat" }), row({ id: "2", name: "Bowler" })],
    { "1": "inventory/1/a.jpg" },
    { "inventory/1/a.jpg": "https://signed.example/a.jpg" },
  );
  expect(out[0].photoUrl).toBe("https://signed.example/a.jpg");
  expect(out[1].photoUrl).toBeNull();
});

test("attachInventoryPhotoUrls: path with no signed url falls back to null", () => {
  const out = attachInventoryPhotoUrls(
    [row({ id: "1", name: "Top hat" })],
    { "1": "inventory/1/a.jpg" },
    {},
  );
  expect(out[0].photoUrl).toBeNull();
});
