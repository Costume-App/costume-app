import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delMaybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle: delMaybeSingle }));
const delEqDesign = vi.fn(() => ({ select: delSelect }));
const delEqId = vi.fn(() => ({ eq: delEqDesign }));
const del = vi.fn(() => ({ eq: delEqId }));
const select = vi.fn((_cols: string, _opts?: unknown) => ({ eq: listEq }));
const from = vi.fn((_t: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listCostumeDesignImages,
  countCostumeDesignImages,
  addCostumeDesignImage,
  deleteCostumeDesignImage,
} from "@/lib/data/costume-design-images";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, delMaybeSingle, delSelect, delEqDesign, delEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  listEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle: delMaybeSingle });
  delEqDesign.mockReturnValue({ select: delSelect });
  delEqId.mockReturnValue({ eq: delEqDesign });
  del.mockReturnValue({ eq: delEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listCostumeDesignImages filters by design, oldest-first", async () => {
  order.mockResolvedValue({ data: [{ id: "i1", costume_design_id: "d1", storage_path: "p", created_at: "t" }], error: null });
  const rows = await listCostumeDesignImages("d1");
  expect(from).toHaveBeenCalledWith("costume_design_images");
  expect(listEq).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", costume_design_id: "d1", storage_path: "p", created_at: "t" }]);
});

test("countCostumeDesignImages returns the exact head count", async () => {
  const countEqResolved = vi.fn().mockResolvedValue({ count: 3, error: null });
  select.mockReturnValueOnce({ eq: countEqResolved });
  const n = await countCostumeDesignImages("d1");
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(countEqResolved).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(n).toBe(3);
});

test("addCostumeDesignImage inserts and returns the row", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i9", costume_design_id: "d1", storage_path: "p", created_at: "t" }, error: null });
  const row = await addCostumeDesignImage("d1", "p");
  expect(insert).toHaveBeenCalledWith({ costume_design_id: "d1", storage_path: "p" });
  expect(row.id).toBe("i9");
});

test("deleteCostumeDesignImage deletes by id scoped to the design and returns the path", async () => {
  delMaybeSingle.mockResolvedValue({ data: { storage_path: "p/x.jpg" }, error: null });
  const path = await deleteCostumeDesignImage("d1", "i1");
  expect(delEqId).toHaveBeenCalledWith("id", "i1");
  expect(delEqDesign).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(path).toBe("p/x.jpg");
});

test("deleteCostumeDesignImage returns null when nothing matched", async () => {
  delMaybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteCostumeDesignImage("d1", "nope")).toBeNull();
});
