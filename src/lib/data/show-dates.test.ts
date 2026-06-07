import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order = vi.fn();
const inFn = vi.fn(() => ({ order }));
const selectList = vi.fn(() => ({ in: inFn }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delEq2 = vi.fn();
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select: selectList, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listShowDates, addShowDate, deleteShowDate } from "@/lib/data/show-dates";

beforeEach(() => {
  [order, inFn, selectList, single, insertSelect, insert, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  inFn.mockReturnValue({ order });
  selectList.mockReturnValue({ in: inFn });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select: selectList, insert, delete: del });
});

test("listShowDates returns [] without querying for an empty id list", async () => {
  expect(await listShowDates([])).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test("listShowDates queries show_dates by production_id, ordered by date", async () => {
  order.mockResolvedValue({ data: [{ id: "s1", production_id: "p1", show_date: "2026-07-01" }], error: null });
  const rows = await listShowDates(["p1", "p2"]);
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(inFn).toHaveBeenCalledWith("production_id", ["p1", "p2"]);
  expect(order).toHaveBeenCalledWith("show_date", { ascending: true });
  expect(rows).toEqual([{ id: "s1", production_id: "p1", show_date: "2026-07-01" }]);
});

test("addShowDate inserts and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "s2", production_id: "p1", show_date: "2026-08-01" }, error: null });
  const row = await addShowDate("p1", "2026-08-01");
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-01" });
  expect(row).toEqual({ id: "s2", production_id: "p1", show_date: "2026-08-01" });
});

test("addShowDate rejects an empty date with ValidationError", async () => {
  await expect(addShowDate("p1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("deleteShowDate deletes scoped by id and production_id", async () => {
  delEq2.mockResolvedValue({ error: null });
  await deleteShowDate("p1", "s1");
  expect(delEq1).toHaveBeenCalledWith("id", "s1");
  expect(delEq2).toHaveBeenCalledWith("production_id", "p1");
});

test("deleteShowDate throws on supabase error", async () => {
  delEq2.mockResolvedValue({ error: { message: "boom" } });
  await expect(deleteShowDate("p1", "s1")).rejects.toThrow("boom");
});
