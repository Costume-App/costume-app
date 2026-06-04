import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

const createPerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  createPerformer: (...a: unknown[]) => createPerformer(...a),
}));

import { listCastings, addCastMember } from "@/lib/data/castings";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, select, from, createPerformer].forEach((m) =>
    m.mockReset(),
  );
  listEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert });
});

test("listCastings filters by production, ordered by created_at", async () => {
  order.mockResolvedValue({
    data: [{ id: "c1", role_id: "r1", performer_id: "pf1", assignment: "primary" }],
    error: null,
  });
  const rows = await listCastings("p1");
  expect(from).toHaveBeenCalledWith("castings");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "c1", role_id: "r1", performer_id: "pf1", assignment: "primary" }]);
});

test("addCastMember creates a performer then a casting and returns both", async () => {
  createPerformer.mockResolvedValue({ id: "pf9", label: "Ava" });
  insertSingle.mockResolvedValue({
    data: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    roleId: "r1",
    name: "Ava",
    assignment: "understudy",
  });
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Ava" });
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    role_id: "r1",
    performer_id: "pf9",
    assignment: "understudy",
  });
  expect(result).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
  });
});

test("addCastMember rejects an invalid assignment", async () => {
  await expect(
    // @ts-expect-error testing runtime guard with a bad value
    addCastMember({ productionId: "p1", roleId: "r1", name: "Ava", assignment: "lead" }),
  ).rejects.toThrow("assignment");
  expect(createPerformer).not.toHaveBeenCalled();
});
