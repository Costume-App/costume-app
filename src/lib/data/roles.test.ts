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
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listRoles, createRole, deleteRole } from "@/lib/data/roles";

beforeEach(() => {
  [order2, order1, listEq, insertSingle, insertSelect, insert, deleteEqProd, deleteEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  order1.mockReturnValue({ order: order2 });
  listEq.mockReturnValue({ order: order1 });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  deleteEqId.mockReturnValue({ eq: deleteEqProd });
  del.mockReturnValue({ eq: deleteEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listRoles filters by production, ordered by display_order then created_at", async () => {
  order2.mockResolvedValue({ data: [{ id: "r1", name: "Bert" }], error: null });
  const rows = await listRoles("p1");
  expect(from).toHaveBeenCalledWith("roles");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order1).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "r1", name: "Bert" }]);
});

test("createRole inserts a trimmed name", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r2", name: "Mary Poppins" }, error: null });
  const row = await createRole({ productionId: "p1", name: "  Mary Poppins  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Mary Poppins" });
  expect(row).toEqual({ id: "r2", name: "Mary Poppins" });
});

test("createRole rejects an empty name", async () => {
  await expect(createRole({ productionId: "p1", name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("deleteRole deletes by id scoped to the production", async () => {
  deleteEqProd.mockResolvedValue({ error: null });
  await deleteRole("p1", "r1");
  expect(del).toHaveBeenCalled();
  expect(deleteEqId).toHaveBeenCalledWith("id", "r1");
  expect(deleteEqProd).toHaveBeenCalledWith("production_id", "p1");
});
