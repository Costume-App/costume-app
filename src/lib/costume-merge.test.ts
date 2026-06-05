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
