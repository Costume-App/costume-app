import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

const createPerformer = vi.fn();
const deletePerformer = vi.fn();
const getPerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  createPerformer: (...a: unknown[]) => createPerformer(...a),
  deletePerformer: (...a: unknown[]) => deletePerformer(...a),
  getPerformer: (...a: unknown[]) => getPerformer(...a),
}));

import { listCastings, addCastMember } from "@/lib/data/castings";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, select, from, createPerformer, deletePerformer, getPerformer].forEach(
    (m) => m.mockReset(),
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
    data: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    castId: "ct1",
    roleId: "r1",
    roleIsEnsemble: false,
    name: "Ava",
    assignment: "understudy",
  });
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Ava" });
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    cast_id: "ct1",
    role_id: "r1",
    performer_id: "pf9",
    assignment: "understudy",
  });
  expect(result).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "understudy" },
  });
});

test("addCastMember rejects an invalid assignment", async () => {
  await expect(
    // @ts-expect-error testing runtime guard with a bad value
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, name: "Ava", assignment: "lead" }),
  ).rejects.toThrow("assignment");
  expect(createPerformer).not.toHaveBeenCalled();
});

test("addCastMember maps a duplicate (23505) to ValidationError and rolls back the performer", async () => {
  createPerformer.mockResolvedValue({ id: "pf9", label: "Ava" });
  insertSingle.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value" } });
  deletePerformer.mockResolvedValue(undefined);
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, name: "Ava", assignment: "primary" }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(deletePerformer).toHaveBeenCalledWith("pf9");
});

test("addCastMember with performerId reuses the existing performer (no create, no rollback)", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "p1", label: "Amy" });
  insertSingle.mockResolvedValue({
    data: { id: "c5", cast_id: "ct1", role_id: "r2", performer_id: "pf1", assignment: "ensemble" },
    error: null,
  });
  const result = await addCastMember({
    productionId: "p1",
    castId: "ct1",
    roleId: "r2",
    roleIsEnsemble: true,
    performerId: "pf1",
    assignment: "ensemble",
  });
  expect(createPerformer).not.toHaveBeenCalled();
  expect(insert).toHaveBeenCalledWith({
    production_id: "p1",
    cast_id: "ct1",
    role_id: "r2",
    performer_id: "pf1",
    assignment: "ensemble",
  });
  expect(result.performer).toEqual({ id: "pf1", production_id: "p1", label: "Amy" });
});

test("addCastMember rejects a performer from another production", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "OTHER", label: "Amy" });
  const { NotFoundError } = await import("@/lib/errors");
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, performerId: "pf1", assignment: "primary" }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(insert).not.toHaveBeenCalled();
});

test("addCastMember rejects primary/understudy on an ensemble role and ensemble on a regular role", async () => {
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: true, name: "Ava", assignment: "primary" }),
  ).rejects.toBeInstanceOf(ValidationError);
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, name: "Ava", assignment: "ensemble" }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(createPerformer).not.toHaveBeenCalled();
});

test("addCastMember maps a duplicate performer-in-role to a specific message and does not delete a reused performer", async () => {
  getPerformer.mockResolvedValue({ id: "pf1", production_id: "p1", label: "Amy" });
  insertSingle.mockResolvedValue({
    data: null,
    error: { code: "23505", message: 'duplicate key value violates unique constraint "castings_cast_role_performer_key"' },
  });
  await expect(
    addCastMember({ productionId: "p1", castId: "ct1", roleId: "r1", roleIsEnsemble: false, performerId: "pf1", assignment: "understudy" }),
  ).rejects.toThrow("That performer is already in this role for this cast.");
  expect(deletePerformer).not.toHaveBeenCalled();
});
