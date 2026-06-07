import { expect, test } from "vitest";
import { resolvePieceSources, pieceCountByRole, pieceKey } from "@/lib/costume-merge";

const designs = [
  { id: "d1", role_id: "r1", name: "Jacket", display_order: 0 },
  { id: "d2", role_id: "r1", name: "Vest", display_order: 1 },
  { id: "d3", role_id: "r2", name: "Skirt", display_order: 0 },
];

test("pieceCountByRole counts designs per role", () => {
  expect(pieceCountByRole(designs)).toEqual({ r1: 2, r2: 1 });
});

test("resolvePieceSources defaults missing rows to make", () => {
  const map = resolvePieceSources([
    { id: "p1", costume_design_id: "d1", casting_id: "c1", source: "on_hand", shared_with_piece_id: null, source_note: "from closet" },
  ]);
  expect(map[pieceKey("c1", "d1")]).toEqual({ source: "on_hand", sharedWithPieceId: null, sourceNote: "from closet" });
  expect(map[pieceKey("c1", "d2")]).toBeUndefined();
});

import { pieceRowIsEmpty } from "@/lib/costume-merge";

const emptyInput = {
  source: "make" as const,
  sourceNote: null,
  fabricType: null,
  fabricColor: null,
  fabricWidth: null,
  fabricSupplier: null,
  fabricYardage: null,
  fabricUnitCost: null,
  made: false,
};

test("pieceRowIsEmpty: bare make row with nothing set is empty", () => {
  expect(pieceRowIsEmpty(emptyInput)).toBe(true);
});

test("pieceRowIsEmpty: non-make source is never empty", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, source: "on_hand" })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, source: "shared" })).toBe(false);
});

test("pieceRowIsEmpty: a note keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, sourceNote: "from scratch" })).toBe(false);
});

test("pieceRowIsEmpty: any fabric field keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, fabricType: "wool" })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, fabricYardage: 2 })).toBe(false);
  expect(pieceRowIsEmpty({ ...emptyInput, fabricUnitCost: 0 })).toBe(false);
});

test("pieceRowIsEmpty: made keeps the row", () => {
  expect(pieceRowIsEmpty({ ...emptyInput, made: true })).toBe(false);
});
