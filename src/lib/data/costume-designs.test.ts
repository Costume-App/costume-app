import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const listEq = vi.fn(() => ({ order: order1 }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEqProd = vi.fn();
const deleteEqId = vi.fn(() => ({ eq: deleteEqProd }));
const del = vi.fn(() => ({ eq: deleteEqId }));
const updateMaybeSingle = vi.fn();
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEqProd = vi.fn(() => ({ select: updateSelect }));
const updateEqId = vi.fn(() => ({ eq: updateEqProd }));
const update = vi.fn(() => ({ eq: updateEqId }));
const invIn = vi.fn();
const select = vi.fn(() => ({ eq: listEq, in: invIn }));
const from = vi.fn(() => ({ select, insert, delete: del, update }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => from() } }));

import { listCostumeDesigns, createCostumeDesign, deleteCostumeDesign, setCostumeDesignNotes } from "@/lib/data/costume-designs";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEqProd, deleteEqId, del,
    updateMaybeSingle, updateSelect, updateEqProd, updateEqId, update, select, from, invIn].forEach((m) => m.mockReset());
  order1.mockReturnValue({ order: order2 });
  listEq.mockReturnValue({ order: order1 });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  deleteEqId.mockReturnValue({ eq: deleteEqProd });
  del.mockReturnValue({ eq: deleteEqId });
  updateSelect.mockReturnValue({ maybeSingle: updateMaybeSingle });
  updateEqProd.mockReturnValue({ select: updateSelect });
  updateEqId.mockReturnValue({ eq: updateEqProd });
  update.mockReturnValue({ eq: updateEqId });
  select.mockReturnValue({ eq: listEq, in: invIn });
  from.mockReturnValue({ select, insert, delete: del, update });
});

test("listCostumeDesigns returns rows for a production", async () => {
  order2.mockResolvedValue({ data: [{ id: "d1" }], error: null });
  expect(await listCostumeDesigns("p1")).toEqual([{ id: "d1" }]);
});

test("createCostumeDesign trims and requires a name", async () => {
  await expect(createCostumeDesign({ productionId: "p1", roleId: "r1", name: "  " }))
    .rejects.toBeInstanceOf(ValidationError);
  insertSingle.mockResolvedValue({ data: { id: "d1", name: "Jacket" }, error: null });
  const row = await createCostumeDesign({ productionId: "p1", roleId: "r1", name: "  Jacket  " });
  expect(row).toEqual({ id: "d1", name: "Jacket" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", role_id: "r1", name: "Jacket" });
});

test("createCostumeDesign includes inventory_item_id when linked", async () => {
  insertSingle.mockResolvedValue({ data: { id: "d2", name: "Cloak", inventory_item_id: "i1" }, error: null });
  await createCostumeDesign({ productionId: "p1", roleId: "r1", name: "Cloak", inventoryItemId: "i1" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", role_id: "r1", name: "Cloak", inventory_item_id: "i1" });
});

test("deleteCostumeDesign is scoped to the production", async () => {
  deleteEqProd.mockResolvedValue({ error: null });
  await deleteCostumeDesign("p1", "d1");
  expect(deleteEqId).toHaveBeenCalledWith("id", "d1");
  expect(deleteEqProd).toHaveBeenCalledWith("production_id", "p1");
});

test("setCostumeDesignNotes updates notes scoped by id + production", async () => {
  updateMaybeSingle.mockResolvedValue({ data: { id: "d1", notes: "Use the blue trim" }, error: null });
  const row = await setCostumeDesignNotes("p1", "d1", "Use the blue trim");
  expect(update).toHaveBeenCalledWith({ notes: "Use the blue trim" });
  expect(updateEqId).toHaveBeenCalledWith("id", "d1");
  expect(updateEqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "d1", notes: "Use the blue trim" });
});

test("setCostumeDesignNotes stores null for blank notes", async () => {
  updateMaybeSingle.mockResolvedValue({ data: { id: "d1", notes: null }, error: null });
  await setCostumeDesignNotes("p1", "d1", "");
  expect(update).toHaveBeenCalledWith({ notes: null });
});

test("listCostumeDesigns attaches inventory_location to linked designs only", async () => {
  order2.mockResolvedValue({
    data: [
      { id: "d1", inventory_item_id: null },
      { id: "d2", inventory_item_id: "i1" },
    ],
    error: null,
  });
  invIn.mockResolvedValue({ data: [{ id: "i1", location: "Bin A" }], error: null });

  const rows = await listCostumeDesigns("p1");

  expect(invIn).toHaveBeenCalledWith("id", ["i1"]);
  expect(rows).toEqual([
    { id: "d1", inventory_item_id: null },
    { id: "d2", inventory_item_id: "i1", inventory_location: "Bin A" },
  ]);
});

test("listCostumeDesigns skips the inventory lookup when nothing is linked", async () => {
  order2.mockResolvedValue({ data: [{ id: "d1", inventory_item_id: null }], error: null });
  const rows = await listCostumeDesigns("p1");
  expect(invIn).not.toHaveBeenCalled();
  expect(rows).toEqual([{ id: "d1", inventory_item_id: null }]);
});
