import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const inFn = vi.fn(() => ({ order: order1 }));
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
  [order2, order1, inFn, selectList, single, insertSelect, insert, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  order1.mockReturnValue({ order: order2 });
  inFn.mockReturnValue({ order: order1 });
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

test("listShowDates queries show_dates by production_id, ordered by date then time", async () => {
  order2.mockResolvedValue({
    data: [{ id: "s1", production_id: "p1", show_date: "2026-07-01", show_time: "14:00:00" }],
    error: null,
  });
  const rows = await listShowDates(["p1", "p2"]);
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(inFn).toHaveBeenCalledWith("production_id", ["p1", "p2"]);
  expect(order1).toHaveBeenCalledWith("show_date", { ascending: true });
  expect(order2).toHaveBeenCalledWith("show_time", { ascending: true, nullsFirst: false });
  expect(rows).toEqual([{ id: "s1", production_id: "p1", show_date: "2026-07-01", show_time: "14:00:00" }]);
});

test("addShowDate inserts date + time and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "s2", production_id: "p1", show_date: "2026-08-01", show_time: "14:00:00" }, error: null });
  const row = await addShowDate("p1", "2026-08-01", "14:00");
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-01", show_time: "14:00" });
  expect(row).toEqual({ id: "s2", production_id: "p1", show_date: "2026-08-01", show_time: "14:00:00" });
});

test("addShowDate stores null time when none given", async () => {
  single.mockResolvedValue({ data: { id: "s3", production_id: "p1", show_date: "2026-08-02", show_time: null }, error: null });
  await addShowDate("p1", "2026-08-02", null);
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-02", show_time: null });
});

test("addShowDate rejects an empty date with ValidationError", async () => {
  await expect(addShowDate("p1", "  ", null)).rejects.toBeInstanceOf(ValidationError);
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
