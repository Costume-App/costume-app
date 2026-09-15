import { expect, test } from "vitest";
import { sortRoles } from "@/lib/role-sort";

const roles = [
  { id: "r1", name: "Tevye" },
  { id: "r2", name: "golde" },
  { id: "r3", name: "Yente" },
  { id: "r4", name: "Motel" },
];
const performers = [
  { id: "p1", name: "Zoe Adams" },
  { id: "p2", name: "amy Brown" },
  { id: "p3", name: "Mark Cole" },
];
const castings = [
  { castId: "c1", roleId: "r1", performerId: "p1", assignment: "primary" as const },
  { castId: "c1", roleId: "r2", performerId: "p2", assignment: "primary" as const },
  { castId: "c1", roleId: "r3", performerId: "p3", assignment: "understudy" as const },
  { castId: "c2", roleId: "r3", performerId: "p2", assignment: "primary" as const },
];
const ctx = { castings, performers, selectedCastId: "c1" };
const names = (rs: { name: string }[]) => rs.map((r) => r.name);

test("'order' keeps the original order", () => {
  expect(names(sortRoles(roles, "order", ctx))).toEqual(["Tevye", "golde", "Yente", "Motel"]);
});

test("'character' sorts by role name, case-insensitively", () => {
  expect(names(sortRoles(roles, "character", ctx))).toEqual(["golde", "Motel", "Tevye", "Yente"]);
});

test("'performer' sorts by the selected cast's primary performer; unassigned roles last by name", () => {
  // r2 → amy Brown, r1 → Zoe Adams; r3 only has an understudy in c1, r4 has nobody.
  expect(names(sortRoles(roles, "performer", ctx))).toEqual(["golde", "Tevye", "Motel", "Yente"]);
});

test("'performer' follows the selected cast", () => {
  expect(names(sortRoles(roles, "performer", { ...ctx, selectedCastId: "c2" }))).toEqual([
    "Yente",
    "golde",
    "Motel",
    "Tevye",
  ]);
});

test("names with numbers sort naturally", () => {
  const numbered = [
    { id: "a", name: "Villager 10" },
    { id: "b", name: "Villager 2" },
  ];
  expect(names(sortRoles(numbered, "character", ctx))).toEqual(["Villager 2", "Villager 10"]);
});

test("does not mutate the input", () => {
  const copy = [...roles];
  sortRoles(roles, "character", ctx);
  expect(roles).toEqual(copy);
});

test("'performer' puts ensemble roles (no primary) with the unassigned roles", () => {
  const withEnsemble = [
    { id: "r1", name: "Tevye" },
    { id: "rE", name: "Villagers" },
    { id: "r4", name: "Motel" },
  ];
  const ensembleCastings = [
    ...castings,
    { castId: "c1", roleId: "rE", performerId: "p3", assignment: "ensemble" as const },
  ];
  expect(
    names(sortRoles(withEnsemble, "performer", { castings: ensembleCastings, performers, selectedCastId: "c1" })),
  ).toEqual(["Tevye", "Motel", "Villagers"]);
});
