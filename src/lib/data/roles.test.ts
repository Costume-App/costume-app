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

import { listRoles, createRole, deleteRole, createRoles } from "@/lib/data/roles";

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

test("createRole inserts a trimmed name, regular by default", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r2", name: "Mary Poppins" }, error: null });
  const row = await createRole({ productionId: "p1", name: "  Mary Poppins  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Mary Poppins", is_ensemble: false });
  expect(row).toEqual({ id: "r2", name: "Mary Poppins" });
});

test("createRole can create an ensemble role", async () => {
  insertSingle.mockResolvedValue({ data: { id: "r3", name: "Villagers", is_ensemble: true }, error: null });
  await createRole({ productionId: "p1", name: "Villagers", isEnsemble: true });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", name: "Villagers", is_ensemble: true });
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

// --- createRoles (batch) ---

test("createRoles trims, drops blanks, and appends after the max display_order", async () => {
  // First call: max-order lookup returns highest existing order = 4.
  // createRoles calls .order(...).limit(1), so wire a dedicated chain here.
  const limit = vi.fn().mockResolvedValue({ data: [{ display_order: 4 }], error: null });
  const orderDesc = vi.fn(() => ({ limit }));
  const maxEq = vi.fn(() => ({ order: orderDesc }));
  const batchInsertSelect = vi.fn().mockResolvedValue({
    data: [
      { id: "r1", name: "Hamlet", display_order: 5 },
      { id: "r2", name: "Ophelia", display_order: 6 },
    ],
    error: null,
  });
  const batchInsert = vi.fn(() => ({ select: batchInsertSelect }));
  select.mockReturnValue({ eq: maxEq } as unknown as ReturnType<typeof select>);
  insert.mockReturnValue({ select: batchInsertSelect } as unknown as ReturnType<typeof insert>);
  from.mockReturnValue({ select, insert: batchInsert } as unknown as ReturnType<typeof from>);

  const rows = await createRoles({ productionId: "p1", names: ["  Hamlet ", "Ophelia", "   "] });

  expect(batchInsert).toHaveBeenCalledWith([
    { production_id: "p1", name: "Hamlet", display_order: 5 },
    { production_id: "p1", name: "Ophelia", display_order: 6 },
  ]);
  expect(rows).toEqual([
    { id: "r1", name: "Hamlet", display_order: 5 },
    { id: "r2", name: "Ophelia", display_order: 6 },
  ]);
});

test("createRoles starts at display_order 0 when the production has no roles", async () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const orderDesc = vi.fn(() => ({ limit }));
  const maxEq = vi.fn(() => ({ order: orderDesc }));
  const batchInsertSelect = vi.fn().mockResolvedValue({ data: [{ id: "r1", name: "A", display_order: 0 }], error: null });
  const batchInsert = vi.fn(() => ({ select: batchInsertSelect }));
  select.mockReturnValue({ eq: maxEq } as unknown as ReturnType<typeof select>);
  from.mockReturnValue({ select, insert: batchInsert } as unknown as ReturnType<typeof from>);

  await createRoles({ productionId: "p1", names: ["A"] });
  expect(batchInsert).toHaveBeenCalledWith([{ production_id: "p1", name: "A", display_order: 0 }]);
});

test("createRoles rejects when all names are blank", async () => {
  await expect(createRoles({ productionId: "p1", names: ["  ", ""] })).rejects.toBeInstanceOf(ValidationError);
});
