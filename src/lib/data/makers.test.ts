import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const listOrder = vi.fn();
const listEq = vi.fn(() => ({ order: listOrder }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const updMaybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle: updMaybeSingle }));
const updEqOrg = vi.fn(() => ({ select: updSelect }));
const updEqId = vi.fn(() => ({ eq: updEqOrg }));
const update = vi.fn(() => ({ eq: updEqId }));
const delEqOrg = vi.fn();
const delEqId = vi.fn(() => ({ eq: delEqOrg }));
const del = vi.fn(() => ({ eq: delEqId }));
const select = vi.fn(() => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, update, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listMakers, createMaker, updateMaker, deleteMaker, findMakerByUser } from "@/lib/data/makers";

beforeEach(() => {
  [listOrder, listEq, insertSingle, insertSelect, insert, updMaybeSingle, updSelect, updEqOrg, updEqId, update, delEqOrg, delEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  listEq.mockReturnValue({ order: listOrder });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  updSelect.mockReturnValue({ maybeSingle: updMaybeSingle });
  updEqOrg.mockReturnValue({ select: updSelect });
  updEqId.mockReturnValue({ eq: updEqOrg });
  update.mockReturnValue({ eq: updEqId });
  delEqId.mockReturnValue({ eq: delEqOrg });
  del.mockReturnValue({ eq: delEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, update, delete: del });
});

test("listMakers filters by org, oldest-first", async () => {
  listOrder.mockResolvedValue({ data: [{ id: "m1", org_id: "org_1", name: "Nada", color: "plum" }], error: null });
  const rows = await listMakers("org_1");
  expect(from).toHaveBeenCalledWith("makers");
  expect(listEq).toHaveBeenCalledWith("org_id", "org_1");
  expect(listOrder).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "m1", org_id: "org_1", name: "Nada", color: "plum" }]);
});

test("createMaker inserts a trimmed name with the given color", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m2", org_id: "org_1", name: "Crystal", color: "red" }, error: null });
  const row = await createMaker("org_1", { name: "  Crystal  ", color: "red" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Crystal", color: "red" });
  expect(row.id).toBe("m2");
});

test("createMaker defaults the color to slate", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m3" }, error: null });
  await createMaker("org_1", { name: "Pat" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Pat", color: "slate" });
});

test("createMaker rejects an empty name", async () => {
  await expect(createMaker("org_1", { name: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateMaker patches name and color scoped by id and org", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "m1", name: "Nada", color: "blue" }, error: null });
  const row = await updateMaker("org_1", "m1", { name: " Nada ", color: "blue" });
  expect(update).toHaveBeenCalledWith({ name: "Nada", color: "blue" });
  expect(updEqId).toHaveBeenCalledWith("id", "m1");
  expect(updEqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "m1", name: "Nada", color: "blue" });
});

test("updateMaker rejects an empty name when name is provided", async () => {
  await expect(updateMaker("org_1", "m1", { name: "   " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateMaker throws NotFoundError when no row matches", async () => {
  updMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateMaker("org_1", "nope", { color: "gold" })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteMaker deletes by id scoped to the org", async () => {
  delEqOrg.mockResolvedValue({ error: null });
  await deleteMaker("org_1", "m1");
  expect(delEqId).toHaveBeenCalledWith("id", "m1");
  expect(delEqOrg).toHaveBeenCalledWith("org_id", "org_1");
});

test("createMaker passes clerk_user_id through when given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m9", org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" }, error: null });
  await createMaker("org_1", { name: "Jo", clerkUserId: "user_1" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" });
});

test("createMaker omits clerk_user_id when not given", async () => {
  insertSingle.mockResolvedValue({ data: { id: "m10" }, error: null });
  await createMaker("org_1", { name: "Kim" });
  expect(insert).toHaveBeenCalledWith({ org_id: "org_1", name: "Kim", color: "slate" });
});

test("updateMaker sets clerk_user_id (link) and clears it (unlink)", async () => {
  updMaybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
  await updateMaker("org_1", "m1", { clerkUserId: "user_2" });
  expect(update).toHaveBeenCalledWith({ clerk_user_id: "user_2" });
  await updateMaker("org_1", "m1", { clerkUserId: null });
  expect(update).toHaveBeenCalledWith({ clerk_user_id: null });
});

test("findMakerByUser returns the matching maker or null", async () => {
  const fbuMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "m1", org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1" }, error: null });
  const fbuEqUser = vi.fn(() => ({ maybeSingle: fbuMaybeSingle }));
  const fbuEqOrg = vi.fn(() => ({ eq: fbuEqUser }));
  select.mockReturnValueOnce({ eq: fbuEqOrg });
  const maker = await findMakerByUser("org_1", "user_1");
  expect(fbuEqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(fbuEqUser).toHaveBeenCalledWith("clerk_user_id", "user_1");
  expect(maker?.id).toBe("m1");

  fbuMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  select.mockReturnValueOnce({ eq: fbuEqOrg });
  expect(await findMakerByUser("org_1", "nobody")).toBeNull();
});
