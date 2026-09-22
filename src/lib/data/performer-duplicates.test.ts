import { expect, test, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

const rpc = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));

const listPerformers = vi.fn();
const getFilledMeasurementCounts = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  listPerformers: (...a: unknown[]) => listPerformers(...a),
  getFilledMeasurementCounts: (...a: unknown[]) => getFilledMeasurementCounts(...a),
}));

const listCastings = vi.fn();
vi.mock("@/lib/data/castings", () => ({ listCastings: (...a: unknown[]) => listCastings(...a) }));

import { loadDuplicateGroups, combinePerformers } from "@/lib/data/performer-duplicates";

beforeEach(() => {
  [rpc, listPerformers, getFilledMeasurementCounts, listCastings].forEach((m) => m.mockReset());
});

test("loadDuplicateGroups maps rows into the pure function and returns its groups", async () => {
  listPerformers.mockResolvedValue([
    { id: "p1", production_id: "prod", label: "Ava", notes: null, created_at: "2026-01-01" },
    { id: "p2", production_id: "prod", label: "ava", notes: null, created_at: "2026-01-02" },
  ]);
  listCastings.mockResolvedValue([
    { id: "c1", production_id: "prod", cast_id: "ct1", role_id: "r1", performer_id: "p1", assignment: "primary", created_at: "" },
    { id: "c2", production_id: "prod", cast_id: "ct1", role_id: "r2", performer_id: "p2", assignment: "ensemble", created_at: "" },
  ]);
  getFilledMeasurementCounts.mockResolvedValue({ p2: 4 });

  const groups = await loadDuplicateGroups("prod");

  expect(listPerformers).toHaveBeenCalledWith("prod");
  expect(listCastings).toHaveBeenCalledWith("prod");
  expect(getFilledMeasurementCounts).toHaveBeenCalledWith(["p1", "p2"]);
  expect(groups).toHaveLength(1);
  expect(groups[0].keepId).toBe("p2");
  expect(groups[0].members[1].castings).toEqual([{ castingId: "c1", castId: "ct1", roleId: "r1", assignment: "primary" }]);
});

test("combinePerformers calls the RPC with the production, kept id and dropped ids", async () => {
  rpc.mockResolvedValue({ data: { castings_moved: 2, measurements_filled: 3, performers_removed: 2 }, error: null });
  const counts = await combinePerformers("prod", "p1", ["p2", "p3"]);
  expect(rpc).toHaveBeenCalledWith("combine_performers", { p_production_id: "prod", p_keep: "p1", p_drop: ["p2", "p3"] });
  expect(counts).toEqual({ castings_moved: 2, measurements_filled: 3, performers_removed: 2 });
});

test("combinePerformers maps a castings unique violation to the collision conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow(
    new ConflictError("Same person is cast twice in one role. Remove one casting first."),
  );
});

test("combinePerformers maps a scope failure to the cast-list-changed conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "combine_scope: a dropped performer is not in this production" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow(
    new ConflictError("The cast list changed. Reload and review again."),
  );
});

test("combinePerformers rethrows other errors as plain errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.toThrow("boom");
  await expect(combinePerformers("prod", "p1", ["p2"])).rejects.not.toBeInstanceOf(ConflictError);
});
