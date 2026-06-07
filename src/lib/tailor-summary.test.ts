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
    { label: "Waist", value: 30, unit: "in" },
    { label: "Chest", value: 36, unit: "in" },
  ]);
  expect(map["c2"]).toEqual([{ label: "Chest", value: 40, unit: "in" }]);
  expect(map["c3"]).toBeUndefined();
});

const roles = [
  { id: "r1", name: "Wizard", notes: "flowing" },
  { id: "r2", name: "Page", notes: null },
];
const designs = [
  { id: "d1", role_id: "r1", name: "Cloak", display_order: 0 },
  { id: "d2", role_id: "r1", name: "Hat", display_order: 1 },
  { id: "d3", role_id: "r2", name: "Tunic", display_order: 0 },
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

test("buildMakeWorklist: garment with zero make items is omitted", () => {
  const pieces = [
    row({ costume_design_id: "d3", casting_id: "c3", source: "on_hand" }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.roles.map((r) => r.roleName)).toEqual(["Wizard"]);
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
