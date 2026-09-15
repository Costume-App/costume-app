import { expect, test } from "vitest";
import {
  fitRoleToType,
  removeCasting,
  removeRole,
  renameNewRole,
  setAssignment,
  setCastTarget,
  setPerformerTarget,
  setRoleEnsemble,
  setRoleTarget,
} from "@/lib/cast-import/draft-edits";
import type { Draft } from "@/lib/cast-import/types";

const ROLE = "22222222-2222-4222-8222-222222222222";

// Annie (regular) in casts c0 and c1; Orphans (ensemble) in c0.
const base = (): Draft => ({
  casts: [
    { key: "c0", label: "Red", target: { kind: "new", name: "Red" } },
    { key: "c1", label: "Blue", target: { kind: "new", name: "Blue" } },
  ],
  roles: [
    { key: "r0", sourceName: "Annie", target: { kind: "new", name: "Annie", isEnsemble: false } },
    { key: "r1", sourceName: "Orphans", target: { kind: "new", name: "Orphans", isEnsemble: true } },
  ],
  performers: [
    { key: "p0", sourceName: "Jane", target: { kind: "new", name: "Jane" }, candidateIds: [] },
    { key: "p1", sourceName: "Kim", target: { kind: "new", name: "Kim" }, candidateIds: [] },
    { key: "p2", sourceName: "Lou", target: { kind: "new", name: "Lou" }, candidateIds: [] },
  ],
  castings: [
    { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" },
    { key: "k1", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "understudy" },
    { key: "k2", castKey: "c1", roleKey: "r0", performerKey: "p2", assignment: "primary" },
    { key: "k3", castKey: "c0", roleKey: "r1", performerKey: "p1", assignment: "ensemble" },
    { key: "k4", castKey: "c0", roleKey: "r1", performerKey: "p2", assignment: "ensemble" },
  ],
});

const assignments = (d: Draft) => Object.fromEntries(d.castings.map((c) => [c.key, c.assignment]));

test("making someone primary demotes the other primary in the same role and cast only", () => {
  expect(assignments(setAssignment(base(), "k1", "primary"))).toMatchObject({ k0: "understudy", k1: "primary", k2: "primary" });
});

test("toggling ensemble re-labels the role's castings; back to regular picks a primary per cast", () => {
  const ensemble = setRoleEnsemble(base(), "r0", true);
  expect(ensemble.roles[0].target).toEqual({ kind: "new", name: "Annie", isEnsemble: true });
  expect(assignments(ensemble)).toMatchObject({ k0: "ensemble", k1: "ensemble", k2: "ensemble" });
  const regular = setRoleEnsemble(base(), "r1", false);
  expect(assignments(regular)).toMatchObject({ k3: "primary", k4: "understudy" });
});

test("fitRoleToType keeps an existing primary choice when fitting to regular", () => {
  const d = base();
  d.castings = d.castings.map((c) => (c.key === "k0" ? { ...c, assignment: "understudy" } : c.key === "k1" ? { ...c, assignment: "primary" } : c));
  expect(assignments(fitRoleToType(d, "r0", false))).toMatchObject({ k0: "understudy", k1: "primary", k2: "primary" });
});

test("setRoleTarget points at an existing role and back to a new role named from the list", () => {
  const existing = setRoleTarget(base(), "r1", { kind: "existing", roleId: ROLE });
  expect(existing.roles[1].target).toEqual({ kind: "existing", roleId: ROLE });
  const back = setRoleTarget(existing, "r1", "new");
  expect(back.roles[1].target).toEqual({ kind: "new", name: "Orphans", isEnsemble: true });
  const renamed = renameNewRole(base(), "r0", "Little Orphan Annie");
  expect(setRoleTarget(renamed, "r0", "new").roles[0].target).toEqual({ kind: "new", name: "Little Orphan Annie", isEnsemble: false });
});

test("renameNewRole only renames new roles", () => {
  const d = setRoleTarget(base(), "r0", { kind: "existing", roleId: ROLE });
  expect(renameNewRole(d, "r0", "X").roles[0].target).toEqual({ kind: "existing", roleId: ROLE });
  expect(renameNewRole(base(), "r1", "Newsies").roles[1].target).toMatchObject({ name: "Newsies" });
});

test("cast and performer targets are replaced by key", () => {
  const castId = "11111111-1111-4111-8111-111111111111";
  expect(setCastTarget(base(), "c1", { kind: "existing", castId }).casts[1].target).toEqual({ kind: "existing", castId });
  expect(setPerformerTarget(base(), "p2", { kind: "new", name: "Lou" }).performers[2].target).toEqual({ kind: "new", name: "Lou" });
});

test("removing a casting or a whole role", () => {
  expect(removeCasting(base(), "k1").castings.map((c) => c.key)).toEqual(["k0", "k2", "k3", "k4"]);
  const d = removeRole(base(), "r1");
  expect(d.roles.map((r) => r.key)).toEqual(["r0"]);
  expect(d.castings.map((c) => c.key)).toEqual(["k0", "k1", "k2"]);
});
