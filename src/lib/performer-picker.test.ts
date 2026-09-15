import { expect, test } from "vitest";
import { performerRoleSummaries, pickerCandidates, isLastCasting } from "@/lib/performer-picker";

const performers = [
  { id: "p1", name: "Zoe Adams" },
  { id: "p2", name: "amy Brown" },
  { id: "p3", name: "Mark Cole" },
];
const roles = [
  { id: "r1", name: "Tevye" },
  { id: "r2", name: "Villagers" },
];
const casts = [
  { id: "cA", name: "Cast A" },
  { id: "cB", name: "Cast B" },
];
const castings = [
  { id: "k1", castId: "cA", roleId: "r1", performerId: "p1" },
  { id: "k2", castId: "cB", roleId: "r2", performerId: "p1" },
  { id: "k3", castId: "cA", roleId: "r2", performerId: "p2" },
];

test("performerRoleSummaries lists each performer's roles with cast names", () => {
  expect(performerRoleSummaries(performers, castings, roles, casts)).toEqual({
    p1: "Tevye (Cast A), Villagers (Cast B)",
    p2: "Villagers (Cast A)",
    p3: "",
  });
});

test("performerRoleSummaries omits cast names for single-cast productions", () => {
  expect(performerRoleSummaries(performers, castings, roles, [casts[0]]).p1).toBe("Tevye, Villagers");
});

test("pickerCandidates matches case-insensitively and sorts by name", () => {
  const out = pickerCandidates("a", performers, castings, { castId: "cA", roleId: "r1" });
  // p1 is already Tevye in Cast A → excluded
  expect(out.map((p) => p.id)).toEqual(["p2", "p3"]);
});

test("pickerCandidates with an empty query returns everyone not already in the target", () => {
  const out = pickerCandidates("  ", performers, castings, { castId: "cA", roleId: "r2" });
  expect(out.map((p) => p.name)).toEqual(["Mark Cole", "Zoe Adams"]);
});

test("pickerCandidates allows the same person in the same role for a different cast", () => {
  const out = pickerCandidates("zoe", performers, castings, { castId: "cA", roleId: "r2" });
  expect(out.map((p) => p.id)).toEqual(["p1"]);
});

test("isLastCasting is true only when no other casting has the performer", () => {
  expect(isLastCasting("p1", "k1", castings)).toBe(false);
  expect(isLastCasting("p2", "k3", castings)).toBe(true);
});
