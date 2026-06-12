import { expect, test, vi, beforeEach } from "vitest";

const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));
const listCastings = vi.fn();
vi.mock("@/lib/data/castings", () => ({ listCastings: (...a: unknown[]) => listCastings(...a) }));
const listCostumePieces = vi.fn();
const setPieceInventoryItem = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  setPieceInventoryItem: (...a: unknown[]) => setPieceInventoryItem(...a),
}));
const createInventoryItem = vi.fn();
const getInventoryItem = vi.fn();
vi.mock("@/lib/data/inventory-items", () => ({
  createInventoryItem: (...a: unknown[]) => createInventoryItem(...a),
  getInventoryItem: (...a: unknown[]) => getInventoryItem(...a),
}));
const listCostumeDesignImages = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({ listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a) }));
const addInventoryItemImage = vi.fn();
vi.mock("@/lib/data/inventory-item-images", () => ({ addInventoryItemImage: (...a: unknown[]) => addInventoryItemImage(...a) }));
const copyImage = vi.fn();
vi.mock("@/lib/storage", () => ({ copyImage: (...a: unknown[]) => copyImage(...a) }));

import { addPieceToInventory } from "@/lib/data/piece-to-inventory";

beforeEach(() => {
  [listCostumeDesigns, listCastings, listCostumePieces, setPieceInventoryItem, createInventoryItem, getInventoryItem, listCostumeDesignImages, addInventoryItemImage, copyImage].forEach((m) => m.mockReset());
  listCostumeDesigns.mockResolvedValue([{ id: "d1", name: "Cloak", notes: "Line it" }]);
  listCastings.mockResolvedValue([{ id: "c1", performer_id: "pf1" }]);
});

test("creates an item named for the garment only (no performer), with the design notes, and copies photos", async () => {
  listCostumePieces.mockResolvedValue([]);
  createInventoryItem.mockResolvedValue({ id: "item1", name: "Cloak" });
  listCostumeDesignImages.mockResolvedValue([{ storage_path: "p1/designs/d1/a.jpg" }, { storage_path: "p1/designs/d1/b.jpg" }]);

  const res = await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(createInventoryItem).toHaveBeenCalledWith("org_1", { name: "Cloak", notes: "Line it", quantity: 1 });
  expect(copyImage).toHaveBeenCalledTimes(2);
  expect(copyImage).toHaveBeenNthCalledWith(1, "p1/designs/d1/a.jpg", expect.stringContaining("inventory/item1/"));
  expect(addInventoryItemImage).toHaveBeenCalledTimes(2);
  expect(addInventoryItemImage).toHaveBeenCalledWith("item1", expect.stringContaining("inventory/item1/"));
  expect(setPieceInventoryItem).toHaveBeenCalledWith("d1", "c1", "item1");
  expect(res).toEqual({ item: { id: "item1", name: "Cloak" }, addedInventoryItemId: "item1" });
});

test("is idempotent — an already-linked piece returns the existing item, creating nothing", async () => {
  listCostumePieces.mockResolvedValue([{ casting_id: "c1", costume_design_id: "d1", added_inventory_item_id: "old1" }]);
  getInventoryItem.mockResolvedValue({ id: "old1", name: "Cloak (Ana)" });

  const res = await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(getInventoryItem).toHaveBeenCalledWith("org_1", "old1");
  expect(createInventoryItem).not.toHaveBeenCalled();
  expect(copyImage).not.toHaveBeenCalled();
  expect(setPieceInventoryItem).not.toHaveBeenCalled();
  expect(res).toEqual({ item: { id: "old1", name: "Cloak (Ana)" }, addedInventoryItemId: "old1" });
});

test("a photoless design yields an item with no image copies", async () => {
  listCostumePieces.mockResolvedValue([]);
  createInventoryItem.mockResolvedValue({ id: "item2", name: "Cloak (Ana)" });
  listCostumeDesignImages.mockResolvedValue([]);

  await addPieceToInventory("org_1", "p1", "d1", "c1");

  expect(copyImage).not.toHaveBeenCalled();
  expect(addInventoryItemImage).not.toHaveBeenCalled();
  expect(setPieceInventoryItem).toHaveBeenCalledWith("d1", "c1", "item2");
});

test("throws NotFound when the design isn't in the production", async () => {
  listCostumeDesigns.mockResolvedValue([]);
  const { NotFoundError } = await import("@/lib/errors");
  await expect(addPieceToInventory("org_1", "p1", "dX", "c1")).rejects.toBeInstanceOf(NotFoundError);
});

test("throws NotFound when the casting isn't in the production", async () => {
  listCastings.mockResolvedValue([]);
  const { NotFoundError } = await import("@/lib/errors");
  await expect(addPieceToInventory("org_1", "p1", "d1", "cX")).rejects.toBeInstanceOf(NotFoundError);
});
