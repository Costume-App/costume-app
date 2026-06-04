import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

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
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del, update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listCasts, createCast, deleteCast, updateCast } from "@/lib/data/casts";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEqProd, deleteEqId, del,
    updateMaybeSingle, updateSelect, updateEqProd, updateEqId, update, select, from].forEach((m) => m.mockReset());
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
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del, update });
});

test("listCasts filters by production, ordered by display_order then created_at", async () => {
  order2.mockResolvedValue({ data: [{ id: "ct1", name: "Gold" }], error: null });
  const rows = await listCasts("p1");
  expect(from).toHaveBeenCalledWith("casts");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "ct1", name: "Gold" }]);
});

test("createCast inserts a trimmed name with default color", async () => {
  insertSingle.mockResolvedValue({ data: { id: "ct2", name: "Blue", color: "blue" }, error: null });
  const row = await createCast({ productionId: "p1", name: "  Blue  ", color: "blue" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Blue", color: "blue" });
  expect(row).toEqual({ id: "ct2", name: "Blue", color: "blue" });
});

test("createCast falls back to 'slate' when no color given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "ct3", name: "Cast C", color: "slate" }, error: null });
  await createCast({ productionId: "p1", name: "Cast C" });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Cast C", color: "slate" });
});

test("createCast rejects an empty name", async () => {
  await expect(createCast({ productionId: "p1", name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("deleteCast deletes by id scoped to the production", async () => {
  deleteEqProd.mockResolvedValue({ error: null });
  await deleteCast("p1", "ct1");
  expect(deleteEqId).toHaveBeenCalledWith("id", "ct1");
  expect(deleteEqProd).toHaveBeenCalledWith("production_id", "p1");
});

test("updateCast updates a trimmed name scoped to the production", async () => {
  updateMaybeSingle.mockResolvedValue({ data: { id: "ct1", name: "Gold Cast" }, error: null });
  const row = await updateCast("p1", "ct1", "  Gold Cast  ");
  expect(update).toHaveBeenCalledWith({ name: "Gold Cast" });
  expect(updateEqId).toHaveBeenCalledWith("id", "ct1");
  expect(updateEqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "ct1", name: "Gold Cast" });
});

test("updateCast rejects an empty name", async () => {
  await expect(updateCast("p1", "ct1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("updateCast throws NotFoundError when no row matches the production", async () => {
  updateMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateCast("p1", "ctX", "Gold")).rejects.toBeInstanceOf(NotFoundError);
});
