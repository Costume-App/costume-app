import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const eqList = vi.fn(() => ({ order }));
const selectList = vi.fn(() => ({ eq: eqList }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const maybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle }));
const delEq2 = vi.fn(() => ({ select: delSelect }));
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select: selectList, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listRoleImages, addRoleImage, deleteRoleImage } from "@/lib/data/role-images";

beforeEach(() => {
  [order, eqList, selectList, single, insertSelect, insert, maybeSingle, delSelect, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  eqList.mockReturnValue({ order });
  selectList.mockReturnValue({ eq: eqList });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle });
  delEq2.mockReturnValue({ select: delSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select: selectList, insert, delete: del });
});

test("listRoleImages queries by role_id ordered by created_at", async () => {
  order.mockResolvedValue({ data: [{ id: "i1", role_id: "r1", storage_path: "p/q.jpg" }], error: null });
  const rows = await listRoleImages("r1");
  expect(from).toHaveBeenCalledWith("role_images");
  expect(eqList).toHaveBeenCalledWith("role_id", "r1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", role_id: "r1", storage_path: "p/q.jpg" }]);
});

test("addRoleImage inserts role_id + storage_path and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "i2", role_id: "r1", storage_path: "p/x.jpg" }, error: null });
  const row = await addRoleImage("r1", "p/x.jpg");
  expect(insert).toHaveBeenCalledWith({ role_id: "r1", storage_path: "p/x.jpg" });
  expect(row).toEqual({ id: "i2", role_id: "r1", storage_path: "p/x.jpg" });
});

test("deleteRoleImage deletes scoped by id+role_id and returns the storage_path", async () => {
  maybeSingle.mockResolvedValue({ data: { storage_path: "p/x.jpg" }, error: null });
  const path = await deleteRoleImage("r1", "i2");
  expect(delEq1).toHaveBeenCalledWith("id", "i2");
  expect(delEq2).toHaveBeenCalledWith("role_id", "r1");
  expect(path).toBe("p/x.jpg");
});

test("deleteRoleImage returns null when nothing matched", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteRoleImage("r1", "nope")).toBeNull();
});
