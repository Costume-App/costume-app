import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

// select("performer_id") -> .eq(id).eq(production).maybeSingle()   (find)
// select("id")           -> .eq(performer_id).limit(1)             (remaining)
// delete()               -> .eq(id)
const findMaybeSingle = vi.fn();
const findEqProd = vi.fn(() => ({ maybeSingle: findMaybeSingle }));
const findEqId = vi.fn(() => ({ eq: findEqProd }));
const remainingLimit = vi.fn();
const remainingEq = vi.fn(() => ({ limit: remainingLimit }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));
const select = vi.fn((cols: string) => (cols === "performer_id" ? { eq: findEqId } : { eq: remainingEq }));
const from = vi.fn((_t: string) => ({ select, delete: del }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

const deletePerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  createPerformer: vi.fn(),
  getPerformer: vi.fn(),
  deletePerformer: (...a: unknown[]) => deletePerformer(...a),
}));

import { removeCasting } from "@/lib/data/castings";

beforeEach(() => {
  [findMaybeSingle, findEqProd, findEqId, remainingLimit, remainingEq, deleteEq, del, select, from, deletePerformer].forEach(
    (m) => m.mockReset(),
  );
  findEqProd.mockReturnValue({ maybeSingle: findMaybeSingle });
  findEqId.mockReturnValue({ eq: findEqProd });
  remainingEq.mockReturnValue({ limit: remainingLimit });
  del.mockReturnValue({ eq: deleteEq });
  select.mockImplementation((cols: string) => (cols === "performer_id" ? { eq: findEqId } : { eq: remainingEq }));
  from.mockReturnValue({ select, delete: del });
  deleteEq.mockResolvedValue({ error: null });
});

test("removes only the casting when the performer has other roles", async () => {
  findMaybeSingle.mockResolvedValue({ data: { performer_id: "pf1" }, error: null });
  remainingLimit.mockResolvedValue({ data: [{ id: "c2" }], error: null });
  expect(await removeCasting("p1", "c1")).toEqual({ performerDeleted: false });
  expect(findEqId).toHaveBeenCalledWith("id", "c1");
  expect(findEqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(deleteEq).toHaveBeenCalledWith("id", "c1");
  expect(remainingEq).toHaveBeenCalledWith("performer_id", "pf1");
  expect(deletePerformer).not.toHaveBeenCalled();
});

test("deletes the performer when it was their last casting", async () => {
  findMaybeSingle.mockResolvedValue({ data: { performer_id: "pf1" }, error: null });
  remainingLimit.mockResolvedValue({ data: [], error: null });
  deletePerformer.mockResolvedValue(undefined);
  expect(await removeCasting("p1", "c1")).toEqual({ performerDeleted: true });
  expect(deletePerformer).toHaveBeenCalledWith("pf1");
});

test("404s a casting outside the production without deleting anything", async () => {
  findMaybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(removeCasting("p1", "cX")).rejects.toBeInstanceOf(NotFoundError);
  expect(del).not.toHaveBeenCalled();
});
