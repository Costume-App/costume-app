import { expect, test } from "vitest";
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  buildMeasurementsByCasting,
  type PieceRow,
} from "@/lib/tailor-summary";

test("buildMeasurementsByCasting groups per casting and orders by definition", () => {
  const defs = [
    { key: "chest", label: "Chest", display_order: 1 },
    { key: "waist", label: "Waist", display_order: 0 },
  ];
  const meas = [
    { performer_id: "p1", measurement_key: "chest", value_numeric: 36, unit: "in" },
    { performer_id: "p1", measurement_key: "waist", value_numeric: 30, unit: "in" },
    { performer_id: "p2", measurement_key: "chest", value_numeric: 40, unit: "in" },
  ];
  const castings = [
    { id: "c1", performer_id: "p1" },
    { id: "c2", performer_id: "p2" },
    { id: "c3", performer_id: "p3" }, // no measurements
  ];
  const map = buildMeasurementsByCasting(defs, meas, castings);
  expect(map["c1"]).toEqual([
    { key: "waist", label: "Waist", value: 30, unit: "in" },
    { key: "chest", label: "Chest", value: 36, unit: "in" },
  ]);
  expect(map["c2"]).toEqual([{ key: "chest", label: "Chest", value: 40, unit: "in" }]);
  expect(map["c3"]).toBeUndefined();
});

const roles = [
  { id: "r1", name: "Wizard", notes: "flowing" },
  { id: "r2", name: "Page", notes: null },
];
const designs = [
  { id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null },
  { id: "d2", role_id: "r1", name: "Hat", display_order: 1, inventory_item_id: null },
  { id: "d3", role_id: "r2", name: "Tunic", display_order: 0, inventory_item_id: null },
];
const castings = [
  { id: "c1", cast_id: "castA", role_id: "r1", performer_id: "p1", assignment: "primary" as const },
  { id: "c2", cast_id: "castB", role_id: "r1", performer_id: "p2", assignment: "understudy" as const },
  { id: "c3", cast_id: "castA", role_id: "r2", performer_id: "p3", assignment: "primary" as const },
];
const performers = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bea" },
  { id: "p3", name: "Cy" },
];
const casts = [
  { id: "castA", name: "Cast A" },
  { id: "castB", name: "Cast B" },
];

function row(overrides: Partial<PieceRow> & Pick<PieceRow, "costume_design_id" | "casting_id">): PieceRow {
  return {
    source: "make",
    fabric_type: null,
    fabric_color: null,
    fabric_width: null,
    fabric_supplier: null,
    fabric_yardage: null,
    fabric_unit_cost: null,
    made: false,
    maker_id: null,
    ...overrides,
  };
}

test("buildMakeWorklist: lazy default — no rows means everything is to-make", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  expect(wl.totalItems).toBe(5);
  expect(wl.madeItems).toBe(0);
  expect(wl.roles.map((r) => r.roleName)).toEqual(["Wizard", "Page"]);
  expect(wl.roles[0].garments.map((g) => g.designName)).toEqual(["Cloak", "Hat"]);
  expect(wl.roles[0].garments[0].items.map((i) => i.performerName)).toEqual(["Ada", "Bea"]);
});

test("buildMakeWorklist: on_hand and shared are excluded; made is counted", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "on_hand" }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "shared" }),
    row({ costume_design_id: "d1", casting_id: "c2", made: true }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.totalItems).toBe(3);
  expect(wl.madeItems).toBe(1);
});

test("buildMakeWorklist: purchase pieces are excluded from the make worklist", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "purchase" }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  expect(items.some((i) => i.designId === "d1" && i.castingId === "c1")).toBe(false);
  expect(wl.totalItems).toBe(4); // 5 lazy-make minus the one purchased
});

test("buildMakeWorklist: garment with zero make items is omitted", () => {
  const pieces = [
    row({ costume_design_id: "d3", casting_id: "c3", source: "on_hand" }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.roles.map((r) => r.roleName)).toEqual(["Wizard"]);
});

test("buildMakeWorklist: makerId is surfaced on MakeItem from maker_id on PieceRow", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", maker_id: "m1" }),
    row({ costume_design_id: "d1", casting_id: "c2", maker_id: null }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const cloakItems = wl.roles[0].garments[0].items; // d1 = Cloak
  const adaItem = cloakItems.find((i) => i.castingId === "c1")!;
  const beaItem = cloakItems.find((i) => i.castingId === "c2")!;
  expect(adaItem.makerId).toBe("m1");
  expect(beaItem.makerId).toBeNull();
});

test("buildMakeWorklist: casting with no PieceRow gets makerId null", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  const item = wl.roles[0].garments[0].items[0];
  expect(item.makerId).toBeNull();
});

test("buildFabricPurchaseList: identical fabric merges into one line, grouped by type+color", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", fabric_type: "wool", fabric_color: "navy", fabric_width: '60"', fabric_supplier: "Mood", fabric_yardage: 2, fabric_unit_cost: 10 }),
    row({ costume_design_id: "d1", casting_id: "c2", fabric_type: "wool", fabric_color: "navy", fabric_width: '60"', fabric_supplier: "Mood", fabric_yardage: 2.5, fabric_unit_cost: 10 }),
    row({ costume_design_id: "d2", casting_id: "c1", fabric_type: "felt", fabric_yardage: 1, fabric_unit_cost: 4 }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  const pl = buildFabricPurchaseList(items);
  const wool = pl.groups.find((g) => g.type === "wool")!;
  expect(wool.lines).toHaveLength(1); // same width+supplier → one detail line
  expect(wool.lines[0].pieceCount).toBe(2);
  expect(wool.totalYardage).toBe(4.5);
  expect(wool.estCost).toBe(45);
  expect(pl.totalYardage).toBe(5.5);
  expect(pl.totalCost).toBe(49);
});

test("buildFabricPurchaseList: same type+color but different width/supplier → one group, two lines, subtotaled", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", fabric_type: "wool", fabric_color: "navy", fabric_width: '60"', fabric_supplier: "Mood", fabric_yardage: 2, fabric_unit_cost: 10 }),
    row({ costume_design_id: "d1", casting_id: "c2", fabric_type: "wool", fabric_color: "navy", fabric_width: '45"', fabric_supplier: "JoAnn", fabric_yardage: 3, fabric_unit_cost: 8 }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  const pl = buildFabricPurchaseList(items);
  expect(pl.groups).toHaveLength(1);
  const wool = pl.groups[0];
  expect(wool.type).toBe("wool");
  expect(wool.color).toBe("navy");
  expect(wool.lines).toHaveLength(2); // split by width/supplier
  expect(wool.totalYardage).toBe(5); // 2 + 3 subtotaled
  expect(wool.estCost).toBe(44); // 2*10 + 3*8
});

test("buildFabricPurchaseList: pieces without a fabric type go to unspecified", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", fabric_yardage: 3 }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  const pl = buildFabricPurchaseList(items);
  expect(pl.groups).toHaveLength(0);
  expect(pl.unspecified).toHaveLength(items.length);
});

test("buildFabricPurchaseList falls back to the supplier's price when a piece has no unit cost", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: null },
  };
  const list = buildFabricPurchaseList([item], { Mood: 4 });
  expect(list.totalCost).toBe(8); // 2 yd * $4 (from the supplier map)
});

test("buildFabricPurchaseList treats unknown/absent supplier price as 0", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null,
    fabric: { type: "Wool", color: "Black", width: null, supplier: "Unknown", yardage: 2, unitCost: null },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(0);
  expect(buildFabricPurchaseList([item]).totalCost).toBe(0); // no map → today's behavior
});

test("buildFabricPurchaseList still prefers a typed unit cost over the supplier price", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10 },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(20); // typed $10 wins
});

test("buildMakeWorklist excludes inventory-linked designs with no piece row", () => {
  const roles = [{ id: "r1", name: "Ophelia", notes: null }];
  const designs = [
    { id: "d1", role_id: "r1", name: "Gown", display_order: 0, inventory_item_id: null },
    { id: "d2", role_id: "r1", name: "Cloak", display_order: 1, inventory_item_id: "i1" },
  ];
  const castings = [
    { id: "c1", cast_id: "ca1", role_id: "r1", performer_id: "p1", assignment: "primary" as const },
  ];
  const performers = [{ id: "p1", name: "Mia" }];
  const casts = [{ id: "ca1", name: "Cast A" }];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  const designIds = wl.roles.flatMap((r) => r.garments.map((g) => g.designId));
  expect(designIds).toEqual(["d1"]); // Cloak (linked) defaults to on_hand, so it's excluded
  expect(wl.totalItems).toBe(1);
});

test("buildMakeWorklist: makerId filter includes only that maker's pieces", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", maker_id: "m1" }),
    row({ costume_design_id: "d1", casting_id: "c2", maker_id: "m2" }),
    row({ costume_design_id: "d2", casting_id: "c1", maker_id: "m1", made: true }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces, { makerId: "m1" });
  expect(wl.totalItems).toBe(2);
  expect(wl.madeItems).toBe(1);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  expect(items.every((i) => i.makerId === "m1")).toBe(true);
});

test("buildMakeWorklist: makerId filter excludes lazy/no-maker items", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, [], { makerId: "m1" });
  expect(wl.totalItems).toBe(0);
  expect(wl.roles).toEqual([]);
});

test("buildMakeWorklist: no makerId keeps the whole-production behavior", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  expect(wl.totalItems).toBe(5); // unchanged lazy-default count
});
