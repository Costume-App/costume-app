import { expect, test, vi, beforeEach } from "vitest";

const listOrder = vi.fn();
const listEq = vi.fn(() => ({ order: listOrder }));
const countEq = vi.fn();
const inOrder = vi.fn();
const inIn = vi.fn(() => ({ order: inOrder }));
const select = vi.fn();
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delMaybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle: delMaybeSingle }));
const delEq2 = vi.fn(() => ({ select: delSelect }));
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listInventoryItemImages,
  countInventoryItemImages,
  addInventoryItemImage,
  deleteInventoryItemImage,
  firstImagePaths,
} from "@/lib/data/inventory-item-images";

beforeEach(() => {
  [listOrder, listEq, countEq, inOrder, inIn, select, insertSingle, insertSelect, insert,
    delMaybeSingle, delSelect, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  listEq.mockReturnValue({ order: listOrder });
  inIn.mockReturnValue({ order: inOrder });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle: delMaybeSingle });
  delEq2.mockReturnValue({ select: delSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listInventoryItemImages returns rows for an item, oldest-first", async () => {
  select.mockReturnValue({ eq: listEq });
  listOrder.mockResolvedValue({ data: [{ id: "im1", storage_path: "inventory/i1/a.jpg" }], error: null });
  const rows = await listInventoryItemImages("i1");
  expect(from).toHaveBeenCalledWith("inventory_item_images");
  expect(listEq).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(rows).toEqual([{ id: "im1", storage_path: "inventory/i1/a.jpg" }]);
});

test("countInventoryItemImages returns the count", async () => {
  countEq.mockResolvedValue({ count: 3, error: null });
  select.mockReturnValue({ eq: countEq });
  expect(await countInventoryItemImages("i1")).toBe(3);
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
});

test("addInventoryItemImage inserts the path", async () => {
  insertSingle.mockResolvedValue({ data: { id: "im2" }, error: null });
  await addInventoryItemImage("i1", "inventory/i1/b.jpg");
  expect(insert).toHaveBeenCalledWith({ inventory_item_id: "i1", storage_path: "inventory/i1/b.jpg" });
});

test("deleteInventoryItemImage returns the removed path", async () => {
  delMaybeSingle.mockResolvedValue({ data: { storage_path: "inventory/i1/b.jpg" }, error: null });
  const path = await deleteInventoryItemImage("i1", "im2");
  expect(delEq1).toHaveBeenCalledWith("id", "im2");
  expect(delEq2).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(path).toBe("inventory/i1/b.jpg");
});

test("deleteInventoryItemImage returns null when nothing matched", async () => {
  delMaybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteInventoryItemImage("i1", "nope")).toBeNull();
});

test("firstImagePaths maps each item to its earliest image path", async () => {
  select.mockReturnValue({ in: inIn });
  inOrder.mockResolvedValue({
    data: [
      { inventory_item_id: "i1", storage_path: "inventory/i1/a.jpg" },
      { inventory_item_id: "i1", storage_path: "inventory/i1/b.jpg" },
      { inventory_item_id: "i2", storage_path: "inventory/i2/c.jpg" },
    ],
    error: null,
  });
  const map = await firstImagePaths(["i1", "i2"]);
  expect(map).toEqual({ i1: "inventory/i1/a.jpg", i2: "inventory/i2/c.jpg" });
});

test("firstImagePaths short-circuits on empty input", async () => {
  expect(await firstImagePaths([])).toEqual({});
  expect(from).not.toHaveBeenCalled();
});
