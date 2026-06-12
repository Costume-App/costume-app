import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const listOrder = vi.fn();
const getMaybeSingle = vi.fn();
const secondEqGet = vi.fn(() => ({ maybeSingle: getMaybeSingle }));
const firstEq = vi.fn(() => ({ order: listOrder, eq: secondEqGet }));
const select = vi.fn(() => ({ eq: firstEq }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const updMaybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle: updMaybeSingle }));
const updEq2 = vi.fn(() => ({ select: updSelect }));
const updEq1 = vi.fn(() => ({ eq: updEq2 }));
const update = vi.fn(() => ({ eq: updEq1 }));
const delEq2 = vi.fn();
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select, insert, update, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryUsage,
  listInventoryMadeFor,
} from "@/lib/data/inventory-items";

beforeEach(() => {
  [listOrder, getMaybeSingle, secondEqGet, firstEq, select, insertSingle, insertSelect, insert,
    updMaybeSingle, updSelect, updEq2, updEq1, update, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  secondEqGet.mockReturnValue({ maybeSingle: getMaybeSingle });
  firstEq.mockReturnValue({ order: listOrder, eq: secondEqGet });
  select.mockReturnValue({ eq: firstEq });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  updSelect.mockReturnValue({ maybeSingle: updMaybeSingle });
  updEq2.mockReturnValue({ select: updSelect });
  updEq1.mockReturnValue({ eq: updEq2 });
  update.mockReturnValue({ eq: updEq1 });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select, insert, update, delete: del });
});

test("listInventoryItems filters by org, oldest-first", async () => {
  listOrder.mockResolvedValue({ data: [{ id: "i1", org_id: "org_1", name: "Top hat" }], error: null });
  const rows = await listInventoryItems("org_1");
  expect(from).toHaveBeenCalledWith("inventory_items");
  expect(firstEq).toHaveBeenCalledWith("org_id", "org_1");
  expect(listOrder).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", org_id: "org_1", name: "Top hat" }]);
});

test("getInventoryItem returns the row scoped by id and org", async () => {
  getMaybeSingle.mockResolvedValue({ data: { id: "i1", name: "Top hat" }, error: null });
  const row = await getInventoryItem("org_1", "i1");
  expect(firstEq).toHaveBeenCalledWith("id", "i1");
  expect(secondEqGet).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "i1", name: "Top hat" });
});

test("getInventoryItem throws NotFoundError when missing", async () => {
  getMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(getInventoryItem("org_1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});

test("createInventoryItem trims fields and defaults quantity to 1", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i2", name: "Cape" }, error: null });
  await createInventoryItem("org_1", { name: "  Cape  ", category: " Outerwear " });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1",
    name: "Cape",
    category: "Outerwear",
    size: null,
    quantity: 1,
    location: null,
    notes: null,
  });
});

test("createInventoryItem keeps a provided non-negative quantity", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i3" }, error: null });
  await createInventoryItem("org_1", { name: "Glove", quantity: 6 });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1", name: "Glove", category: null, size: null, quantity: 6, location: null, notes: null,
  });
});

test("createInventoryItem rejects an empty name", async () => {
  await expect(createInventoryItem("org_1", { name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateInventoryItem patches only provided fields, scoped by id+org", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "i1", name: "Cape", quantity: 2 }, error: null });
  const row = await updateInventoryItem("org_1", "i1", { name: " Cape ", quantity: 2, location: "" });
  expect(update).toHaveBeenCalledWith({ name: "Cape", quantity: 2, location: null });
  expect(updEq1).toHaveBeenCalledWith("id", "i1");
  expect(updEq2).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "i1", name: "Cape", quantity: 2 });
});

test("updateInventoryItem rejects an empty name when name is provided", async () => {
  await expect(updateInventoryItem("org_1", "i1", { name: "   " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateInventoryItem throws NotFoundError when no row matches", async () => {
  updMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateInventoryItem("org_1", "nope", { notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteInventoryItem deletes by id scoped to the org", async () => {
  delEq2.mockResolvedValue({ error: null });
  await deleteInventoryItem("org_1", "i1");
  expect(delEq1).toHaveBeenCalledWith("id", "i1");
  expect(delEq2).toHaveBeenCalledWith("org_id", "org_1");
});

test("listInventoryUsage flattens production+role names per linked design", async () => {
  listOrder.mockResolvedValue({
    data: [
      { id: "d1", name: "Cloak", production_id: "p1", role_id: "r1",
        productions: { title: "Hamlet" }, roles: { name: "Ophelia" } },
    ],
    error: null,
  });
  const usage = await listInventoryUsage("i1");
  expect(from).toHaveBeenCalledWith("costume_designs");
  expect(select).toHaveBeenCalledWith("id, name, production_id, role_id, productions(title), roles(name)");
  expect(firstEq).toHaveBeenCalledWith("inventory_item_id", "i1");
  expect(usage).toEqual([
    { designId: "d1", designName: "Cloak", productionId: "p1", productionName: "Hamlet", roleId: "r1", roleName: "Ophelia" },
  ]);
});

test("listInventoryMadeFor maps + dedupes production→role from linked pieces (no performer)", async () => {
  listOrder.mockResolvedValue({
    data: [
      { costume_designs: { production_id: "p1", role_id: "r1", productions: { title: "Pippin" }, roles: { name: "Lead" } } },
      { costume_designs: { production_id: "p1", role_id: "r1", productions: { title: "Pippin" }, roles: { name: "Lead" } } }, // dup (2nd performer)
      { costume_designs: { production_id: "p2", role_id: "r2", productions: { title: "Annie" }, roles: { name: "Orphan" } } },
      { costume_designs: null }, // skipped
    ],
    error: null,
  });
  const madeFor = await listInventoryMadeFor("i1");
  expect(from).toHaveBeenCalledWith("costume_pieces");
  expect(firstEq).toHaveBeenCalledWith("added_inventory_item_id", "i1");
  expect(madeFor).toEqual([
    { productionName: "Pippin", roleName: "Lead" },
    { productionName: "Annie", roleName: "Orphan" },
  ]);
});
