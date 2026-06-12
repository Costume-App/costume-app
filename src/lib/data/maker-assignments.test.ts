import { expect, test, vi, beforeEach } from "vitest";

// Table-dispatching supabase mock: each `.from(table)` returns a thenable query
// that records the columns passed to `.select(...)` and resolves to canned rows.
let results: Record<string, { data: unknown; error: unknown }>;
let selectedCols: Record<string, string>;

function makeChain(table: string) {
  const q: Record<string, unknown> = {};
  q.select = (cols: string) => {
    selectedCols[table] = cols;
    return q;
  };
  q.eq = () => q;
  q.in = () => q;
  // thenable: `await from(t).select(...).eq/in(...)` resolves to results[table]
  q.then = (resolve: (v: unknown) => unknown) => resolve(results[table]);
  return q;
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (table: string) => makeChain(table) },
}));

import { listAssignmentsForMaker } from "@/lib/data/maker-assignments";

beforeEach(() => {
  selectedCols = {};
  results = {
    costume_pieces: {
      data: [
        { id: "pc1", costume_design_id: "d1", casting_id: "c1", made: false, made_at: null },
        { id: "pc2", costume_design_id: "dOther", casting_id: "c2", made: true, made_at: "2026-06-01" },
      ],
      error: null,
    },
    costume_designs: {
      data: [
        { id: "d1", production_id: "pr1", role_id: "r1", name: "Cloak" },
        { id: "dOther", production_id: "prOTHER", role_id: "r9", name: "X" },
      ],
      error: null,
    },
    // prOTHER is intentionally NOT returned → simulates a production outside the org
    productions: { data: [{ id: "pr1", title: "Cinderella" }], error: null },
    roles: { data: [{ id: "r1", name: "Footman" }], error: null },
    castings: { data: [{ id: "c1", performer_id: "p1" }, { id: "c2", performer_id: "p2" }], error: null },
    performers: { data: [{ id: "p1", label: "Ada" }, { id: "p2", label: "Bea" }], error: null },
  };
});

test("listAssignmentsForMaker joins rows, maps performer label→name, and drops out-of-org pieces", async () => {
  const rows = await listAssignmentsForMaker("org_1", "m1");
  // pc2's design lives in prOTHER, which the org-filtered productions query didn't return → dropped.
  expect(rows).toEqual([
    {
      pieceId: "pc1",
      productionId: "pr1",
      productionTitle: "Cinderella",
      roleName: "Footman",
      performerName: "Ada",
      designName: "Cloak",
      made: false,
      made_at: null,
    },
  ]);
});

test("listAssignmentsForMaker selects the real column names (schema guard)", async () => {
  await listAssignmentsForMaker("org_1", "m1");
  expect(selectedCols.costume_pieces).toBe("id, costume_design_id, casting_id, made, made_at");
  expect(selectedCols.costume_designs).toBe("id, production_id, role_id, name");
  expect(selectedCols.productions).toBe("id, title");
  expect(selectedCols.roles).toBe("id, name");
  expect(selectedCols.castings).toBe("id, performer_id");
  // The bug we fixed: performers store the display name in `label`, not `name`.
  expect(selectedCols.performers).toBe("id, label");
});

test("listAssignmentsForMaker returns [] when the maker has no pieces", async () => {
  results.costume_pieces = { data: [], error: null };
  expect(await listAssignmentsForMaker("org_1", "m1")).toEqual([]);
});
