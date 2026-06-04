import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const orderCreated = vi.fn();
const orderShow = vi.fn(() => ({ order: orderCreated }));
const eq = vi.fn(() => ({ order: orderShow }));
const select = vi.fn(() => ({ eq }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const from = vi.fn((_table: string) => ({ select, insert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listProductions, createProduction } from "@/lib/data/productions";

beforeEach(() => {
  [orderShow, orderCreated, eq, select, single, insertSelect, insert, from].forEach((m) => m.mockReset());
  eq.mockReturnValue({ order: orderShow });
  orderShow.mockReturnValue({ order: orderCreated });
  select.mockReturnValue({ eq });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  from.mockReturnValue({ select, insert });
});

test("listProductions queries by org, ordered by show_date then created_at", async () => {
  orderCreated.mockResolvedValue({ data: [{ id: "p1", title: "Mary Poppins" }], error: null });
  const rows = await listProductions("org_1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(orderShow).toHaveBeenCalledWith("show_date", { ascending: true, nullsFirst: false });
  expect(orderCreated).toHaveBeenCalledWith("created_at", { ascending: false });
  expect(rows).toEqual([{ id: "p1", title: "Mary Poppins" }]);
});

test("listProductions throws on supabase error", async () => {
  orderCreated.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listProductions("org_1")).rejects.toThrow("boom");
});

test("createProduction inserts the row and returns it", async () => {
  single.mockResolvedValue({ data: { id: "p2", title: "Newsies" }, error: null });
  const row = await createProduction({
    orgId: "org_1",
    createdBy: "user_1",
    title: "Newsies",
    showDate: "2026-11-01",
    notes: null,
  });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1",
    created_by: "user_1",
    title: "Newsies",
    show_date: "2026-11-01",
    notes: null,
  });
  expect(row).toEqual({ id: "p2", title: "Newsies" });
});

test("createProduction rejects an empty title with a ValidationError", async () => {
  await expect(
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "  ", showDate: null, notes: null }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("createProduction throws on supabase error", async () => {
  single.mockResolvedValue({ data: null, error: { message: "insert failed" } });
  await expect(
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "Cats", showDate: null, notes: null }),
  ).rejects.toThrow("insert failed");
});
