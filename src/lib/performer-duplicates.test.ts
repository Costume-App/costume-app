import { expect, test } from "vitest";
import { findDuplicateGroups } from "@/lib/performer-duplicates";

const casting = (id: string, performerId: string, roleId: string, castId = "ct1", assignment: "primary" | "understudy" | "ensemble" = "primary") =>
  ({ id, castId, roleId, performerId, assignment }) as const;

test("groups performers whose names match under matchKey and drops singletons", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Sarah Lee" },
      { id: "p2", name: "sarah  lee" },
      { id: "p3", name: "Bert" },
      { id: "p4", name: "O'Brien" },
      { id: "p5", name: "OBrien" },
    ],
    castings: [casting("c1", "p1", "r1"), casting("c2", "p2", "r2"), casting("c3", "p3", "r3"), casting("c4", "p4", "r4"), casting("c5", "p5", "r5")],
    filledCounts: {},
  });
  expect(groups.map((g) => g.members.map((m) => m.performerId))).toEqual([
    ["p4", "p5"],
    ["p1", "p2"],
  ]);
  expect(groups[1].key).toBe("sarah lee");
});

test("keeps the member with the most filled measurements, then the smallest id", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p9", name: "Ava" },
      { id: "p2", name: "Ava" },
      { id: "p5", name: "Ava" },
    ],
    castings: [casting("c1", "p9", "r1"), casting("c2", "p2", "r2"), casting("c3", "p5", "r3")],
    filledCounts: { p9: 3, p2: 7, p5: 7 },
  });
  expect(groups).toHaveLength(1);
  expect(groups[0].keepId).toBe("p2");
  expect(groups[0].members.map((m) => m.performerId)).toEqual(["p2", "p5", "p9"]);
  expect(groups[0].members[0].filledMeasurements).toBe(7);
});

test("attaches each member's castings", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1"), casting("c2", "p2", "r2", "ct1", "ensemble"), casting("c3", "p2", "r3", "ct2", "understudy")],
    filledCounts: {},
  });
  expect(groups[0].members[1].castings).toEqual([
    { castingId: "c2", castId: "ct1", roleId: "r2", assignment: "ensemble" },
    { castingId: "c3", castId: "ct2", roleId: "r3", assignment: "understudy" },
  ]);
});

test("blocks a group when two members share a cast and role", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1", "ct1", "ensemble"), casting("c2", "p2", "r1", "ct1", "ensemble")],
    filledCounts: {},
  });
  expect(groups[0].blocked).toEqual({ reason: "collision", castId: "ct1", roleId: "r1" });
});

test("the same role in different casts is not a collision", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "Ava" },
      { id: "p2", name: "Ava" },
    ],
    castings: [casting("c1", "p1", "r1", "ct1"), casting("c2", "p2", "r1", "ct2")],
    filledCounts: {},
  });
  expect(groups[0].blocked).toBeNull();
});

test("sorts groups by kept name, case-insensitive", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "zed" },
      { id: "p2", name: "Zed" },
      { id: "p3", name: "Amy" },
      { id: "p4", name: "amy" },
    ],
    castings: [],
    filledCounts: {},
  });
  expect(groups.map((g) => g.members[0].name)).toEqual(["Amy", "zed"]);
});

test("ignores performers whose name normalizes to nothing", () => {
  const groups = findDuplicateGroups({
    performers: [
      { id: "p1", name: "  " },
      { id: "p2", name: "." },
    ],
    castings: [],
    filledCounts: {},
  });
  expect(groups).toEqual([]);
});
