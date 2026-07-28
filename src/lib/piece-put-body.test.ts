import { expect, test } from "vitest";
import { buildSetSourceBody, buildSetPieceFieldBody, type SetPieceFieldPatch } from "@/lib/piece-put-body";
import type { CostumePiece } from "@/lib/data/costume-pieces";

// A piece already carrying a skirt construction — the exact shape that was
// silently erased before this fix: setSource/setPieceField sent a "preserve
// everything" body that simply omitted the skirt fields, which the route (and
// upsertPieceSource) turn into an explicit null, deleting the construction.
const existingWithSkirt: CostumePiece = {
  id: "pp1",
  costume_design_id: "d1",
  casting_id: "c1",
  source: "make",
  shared_with_piece_id: null,
  source_note: null,
  fabric_type: "Cotton",
  fabric_color: "Blue",
  fabric_width: '45"',
  fabric_supplier: "Mood",
  fabric_yardage: 4.75,
  fabric_unit_cost: 12,
  skirt_construction: "full_circle",
  skirt_fullness: null,
  skirt_length_in: 32,
  calculated_yardage: 4.75,
  purchase_price: null,
  made: false,
  made_at: null,
  maker_id: "m1",
  added_inventory_item_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("buildSetSourceBody preserves a skirt construction when only the source changes", () => {
  // Simulates: a piece has a full-circle skirt calculated, then the designer
  // switches its source from "make" to "purchase" in the Costume tab.
  const body = buildSetSourceBody("d1", "c1", "purchase", null, existingWithSkirt);
  expect(body.skirtConstruction).toBe("full_circle");
  expect(body.skirtFullness).toBeNull();
  expect(body.skirtLengthIn).toBe(32);
  // Everything else already recorded survives too.
  expect(body.fabricYardage).toBe(4.75);
  expect(body.fabricType).toBe("Cotton");
  expect(body.makerId).toBe("m1");
});

test("buildSetSourceBody defaults every field when there is no existing row", () => {
  const body = buildSetSourceBody("d1", "c1", "on_hand", null, undefined);
  expect(body).toEqual({
    designId: "d1",
    castingId: "c1",
    source: "on_hand",
    sharedWithCastingId: null,
    fabricType: null,
    fabricColor: null,
    fabricWidth: null,
    fabricSupplier: null,
    fabricYardage: null,
    fabricUnitCost: null,
    skirtConstruction: null,
    skirtFullness: null,
    skirtLengthIn: null,
    calculatedYardage: null,
    purchasePrice: null,
    made: false,
    makerId: null,
  });
});

test("buildSetPieceFieldBody preserves a skirt construction when only the maker changes", () => {
  // Simulates: assigning a maker to a piece that already has a gathered skirt.
  const gathered: CostumePiece = { ...existingWithSkirt, skirt_construction: "gathered", skirt_fullness: 2.5 };
  const body = buildSetPieceFieldBody("d1", "c1", gathered, { makerId: "m2" });
  expect(body.skirtConstruction).toBe("gathered");
  expect(body.skirtFullness).toBe(2.5);
  expect(body.skirtLengthIn).toBe(32);
  expect(body.makerId).toBe("m2"); // the one field the patch actually changes
  expect(body.source).toBe("make"); // source itself untouched
});

test("buildSetPieceFieldBody preserves a skirt construction when ticking made", () => {
  const body = buildSetPieceFieldBody("d1", "c1", existingWithSkirt, { made: true });
  expect(body.skirtConstruction).toBe("full_circle");
  expect(body.skirtLengthIn).toBe(32);
  expect(body.made).toBe(true);
});

test("buildSetPieceFieldBody preserves a skirt construction when editing a purchase price", () => {
  const purchased: CostumePiece = { ...existingWithSkirt, source: "purchase" };
  const body = buildSetPieceFieldBody("d1", "c1", purchased, { purchasePrice: 89.99 });
  expect(body.skirtConstruction).toBe("full_circle");
  expect(body.skirtLengthIn).toBe(32);
  expect(body.purchasePrice).toBe(89.99);
  expect(body.source).toBe("purchase");
});

test("buildSetPieceFieldBody defaults every field with no existing row", () => {
  const body = buildSetPieceFieldBody("d1", "c1", undefined, { made: true });
  expect(body).toEqual({
    designId: "d1",
    castingId: "c1",
    source: "make",
    sharedWithCastingId: null,
    fabricType: null,
    fabricColor: null,
    fabricWidth: null,
    fabricSupplier: null,
    fabricYardage: null,
    fabricUnitCost: null,
    skirtConstruction: null,
    skirtFullness: null,
    skirtLengthIn: null,
    calculatedYardage: null,
    purchasePrice: null,
    made: true,
    makerId: null,
  });
});

test("buildSetSourceBody preserves the calculated yardage", () => {
  expect(buildSetSourceBody("d1", "c1", "make", null, existingWithSkirt).calculatedYardage).toBe(4.75);
});

test("buildSetPieceFieldBody preserves the calculated yardage across every trigger", () => {
  const triggers: SetPieceFieldPatch[] = [
    { makerId: "m1" },
    { made: true },
    { purchasePrice: 12 },
  ];
  for (const patch of triggers) {
    expect(
      buildSetPieceFieldBody("d1", "c1", existingWithSkirt, patch).calculatedYardage,
      `lost on ${JSON.stringify(patch)}`,
    ).toBe(4.75);
  }
});

test("both builders default the calculated yardage to null with no existing row", () => {
  expect(buildSetSourceBody("d1", "c1", "make", null, undefined).calculatedYardage).toBeNull();
  expect(buildSetPieceFieldBody("d1", "c1", undefined, { made: true }).calculatedYardage).toBeNull();
});
