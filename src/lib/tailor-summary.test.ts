import { expect, test } from "vitest";
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  buildMeasurementsByCasting,
  buildPurchaseWorklist,
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
    skirt_construction: null,
    skirt_fullness: null,
    skirt_length_in: null,
    calculated_yardage: null,
    purchase_price: null,
    made: false,
    maker_id: null,
    added_inventory_item_id: null,
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

test("buildMakeWorklist surfaces added_inventory_item_id as item.addedInventoryItemId", async () => {
  const { buildMakeWorklist } = await import("@/lib/tailor-summary");
  const roles = [{ id: "r1", name: "Lead", notes: null }];
  const designs = [{ id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null }];
  const castings = [{ id: "c1", cast_id: "cast1", role_id: "r1", performer_id: "pf1", assignment: "primary" as const }];
  const performers = [{ id: "pf1", name: "Ana" }];
  const casts = [{ id: "cast1", name: "Cast A" }];
  const pieces = [{
    costume_design_id: "d1", casting_id: "c1", source: "make" as const,
    fabric_type: null, fabric_color: null, fabric_width: null, fabric_supplier: null,
    fabric_yardage: null, fabric_unit_cost: null, skirt_construction: null, skirt_fullness: null,
    skirt_length_in: null, calculated_yardage: null,
    purchase_price: null, made: false, maker_id: null,
    added_inventory_item_id: "item1",
  }];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces);
  expect(wl.roles[0].garments[0].items[0].addedInventoryItemId).toBe("item1");
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
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: null, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  const list = buildFabricPurchaseList([item], { Mood: 4 });
  expect(list.totalCost).toBe(8); // 2 yd * $4 (from the supplier map)
});

test("buildFabricPurchaseList treats unknown/absent supplier price as 0", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: null, supplier: "Unknown", yardage: 2, unitCost: null, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(0);
  expect(buildFabricPurchaseList([item]).totalCost).toBe(0); // no map → today's behavior
});

test("buildFabricPurchaseList still prefers a typed unit cost over the supplier price", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(20); // typed $10 wins
});

test("buildFabricPurchaseList: a typed unitCost of 0 wins over the supplier price (not treated as absent)", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 0, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  expect(buildFabricPurchaseList([item], { Mood: 4 }).totalCost).toBe(0); // ?? keeps a real 0, never falls to $4
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

test("buildFabricPurchaseList sets supplierUrl from the name→url map (case-insensitive)", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  const pl = buildFabricPurchaseList([item], {}, { mood: "https://moodfabrics.com" });
  expect(pl.groups[0].lines[0].supplierUrl).toBe("https://moodfabrics.com");
});

test("buildFabricPurchaseList sets supplierUrl null when the supplier has no url", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10, skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null },
  };
  expect(buildFabricPurchaseList([item], {}, {}).groups[0].lines[0].supplierUrl).toBeNull();
  expect(buildFabricPurchaseList([item]).groups[0].lines[0].supplierUrl).toBeNull(); // no map arg
});

test("buildPurchaseWorklist: includes only purchase pieces, sums prices", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "purchase", purchase_price: 45 }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "purchase", purchase_price: 20, made: true }),
    row({ costume_design_id: "d1", casting_id: "c2", source: "make", purchase_price: 999 }), // not purchase
    row({ costume_design_id: "d3", casting_id: "c3", source: "on_hand" }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  expect(pl.totalCost).toBe(65);
  expect(pl.items.map((i) => i.designName)).toEqual(["Cloak", "Hat"]);
  const cloak = pl.items.find((i) => i.designName === "Cloak")!;
  expect(cloak).toMatchObject({
    performerName: "Ada",
    castName: "Cast A",
    roleName: "Wizard",
    price: 45,
    purchased: false,
  });
  expect(pl.items.find((i) => i.designName === "Hat")!.purchased).toBe(true);
});

test("buildPurchaseWorklist: a null price contributes 0", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", source: "purchase", purchase_price: null }),
    row({ costume_design_id: "d2", casting_id: "c2", source: "purchase", purchase_price: 30 }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  expect(pl.totalCost).toBe(30);
  expect(pl.items.find((i) => i.designName === "Cloak")!.price).toBeNull();
});

// A purchase-source piece can still carry a skirt construction (e.g. it was
// switched over from "make" after a construction was already picked). The
// fields need to be on PurchasedItem so a price edit (PurchasedList) can send
// them back unchanged instead of nulling them.
test("buildPurchaseWorklist: carries a piece's skirt fields so a price edit can preserve them", () => {
  const pieces = [
    row({
      costume_design_id: "d1",
      casting_id: "c1",
      source: "purchase",
      purchase_price: 45,
      skirt_construction: "gathered",
      skirt_fullness: 2,
      skirt_length_in: 30,
    }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  const cloak = pl.items.find((i) => i.designName === "Cloak")!;
  expect(cloak.skirtConstruction).toBe("gathered");
  expect(cloak.skirtFullness).toBe(2);
  expect(cloak.skirtLengthIn).toBe(30);
});

// A purchase-source piece can also carry a yardage left over from before it
// was switched from "make" (or hand-typed after). PurchasedItem must carry it
// too, for the same preserve-what's-recorded reason as the skirt fields above
// — otherwise a purchase-price edit nulls it (see PurchasedList.tsx).
test("buildPurchaseWorklist: carries a piece's fabric yardage so a price edit can preserve it", () => {
  const pieces = [
    row({
      costume_design_id: "d1",
      casting_id: "c1",
      source: "purchase",
      purchase_price: 45,
      fabric_yardage: 4.5,
    }),
  ];
  const pl = buildPurchaseWorklist(roles, designs, castings, performers, casts, pieces);
  const cloak = pl.items.find((i) => i.designName === "Cloak")!;
  expect(cloak.fabricYardage).toBe(4.5);
});

test("buildMeasurementsByCasting uses value_text when present", () => {
  const defs = [{ key: "shirt_size", label: "Shirt size", display_order: 0 }];
  const meas = [
    { performer_id: "p1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
  ];
  const castings = [{ id: "c1", performer_id: "p1" }];
  const map = buildMeasurementsByCasting(defs, meas, castings);
  expect(map["c1"]).toEqual([{ key: "shirt_size", label: "Shirt size", value: "L", unit: "" }]);
});
