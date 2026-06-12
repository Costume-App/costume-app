import { expect, test } from "vitest";
import { buildMakerAssignments } from "@/lib/maker-assignments";

const pieces = [
  { id: "pc1", costume_design_id: "d1", casting_id: "c1", made: false, made_at: null },
  { id: "pc2", costume_design_id: "d2", casting_id: "c2", made: true, made_at: "2026-06-01" },
  { id: "pc3", costume_design_id: "dX", casting_id: "c9", made: false, made_at: null }, // design not in org → dropped
];
const designs = [
  { id: "d1", production_id: "pr1", role_id: "r1", name: "Cloak" },
  { id: "d2", production_id: "pr2", role_id: "r2", name: "Cap" },
  // dX intentionally absent (foreign / out of org)
];
const productions = [
  { id: "pr1", title: "Cinderella" },
  { id: "pr2", title: "Oliver!" },
];
const roles = [
  { id: "r1", name: "Footman" },
  { id: "r2", name: "Dodger" },
];
const castings = [
  { id: "c1", performer_id: "p1" },
  { id: "c2", performer_id: "p2" },
];
const performers = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bea" },
];

test("buildMakerAssignments joins and shapes rows, dropping pieces whose design is absent", () => {
  const rows = buildMakerAssignments({ pieces, designs, productions, roles, castings, performers });
  expect(rows).toEqual([
    { pieceId: "pc1", productionId: "pr1", productionTitle: "Cinderella", roleName: "Footman", performerName: "Ada", designName: "Cloak", made: false, made_at: null },
    { pieceId: "pc2", productionId: "pr2", productionTitle: "Oliver!", roleName: "Dodger", performerName: "Bea", designName: "Cap", made: true, made_at: "2026-06-01" },
  ]);
});

test("buildMakerAssignments sorts by production title then role name", () => {
  const rows = buildMakerAssignments({
    pieces: [
      { id: "z", costume_design_id: "d2", casting_id: "c2", made: false, made_at: null },
      { id: "a", costume_design_id: "d1", casting_id: "c1", made: false, made_at: null },
    ],
    designs, productions, roles, castings, performers,
  });
  expect(rows.map((r) => r.productionTitle)).toEqual(["Cinderella", "Oliver!"]);
});

test("buildMakerAssignments uses fallbacks for missing role/performer/production", () => {
  const rows = buildMakerAssignments({
    pieces: [{ id: "pc1", costume_design_id: "d1", casting_id: "cZ", made: false, made_at: null }],
    designs: [{ id: "d1", production_id: "prZ", role_id: "rZ", name: "Mystery" }],
    productions: [], roles: [], castings: [], performers: [],
  });
  expect(rows).toEqual([
    { pieceId: "pc1", productionId: "prZ", productionTitle: "—", roleName: "—", performerName: "—", designName: "Mystery", made: false, made_at: null },
  ]);
});
