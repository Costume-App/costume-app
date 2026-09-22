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

import { ValidationError } from "@/lib/errors";
import {
  parseCombineBody,
  matchRequestedGroups,
  toCombineRequest,
  describeCombineCounts,
  MAX_COMBINE_GROUPS,
  MAX_GROUP_MEMBERS,
  type DuplicateGroup,
} from "@/lib/performer-duplicates";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const member = (performerId: string, filled = 0) => ({ performerId, name: "Ava", filledMeasurements: filled, castings: [] });
const group = (key: string, ids: string[], blocked: DuplicateGroup["blocked"] = null): DuplicateGroup => ({
  key,
  keepId: ids[0],
  members: ids.map((id) => member(id)),
  blocked,
});

test("parseCombineBody accepts well-formed groups of uuids", () => {
  expect(parseCombineBody({ groups: [{ performerIds: [A, B], keepId: A }] })).toEqual([
    { performerIds: [A, B], keepId: A },
  ]);
});

test.each([
  ["not an object", "x"],
  ["groups missing", {}],
  ["group not an object", { groups: ["x"] }],
  ["ids not an array", { groups: [{ performerIds: A, keepId: A }] }],
  ["fewer than two ids", { groups: [{ performerIds: [A], keepId: A }] }],
  ["non-uuid id", { groups: [{ performerIds: [A, "nope"], keepId: A }] }],
  ["repeated id inside a group", { groups: [{ performerIds: [A, A], keepId: A }] }],
  ["no groups", { groups: [] }],
  ["keepId missing", { groups: [{ performerIds: [A, B] }] }],
  ["keepId not one of performerIds", { groups: [{ performerIds: [A, B], keepId: C }] }],
])("parseCombineBody rejects %s", (_label, body) => {
  expect(() => parseCombineBody(body)).toThrow(ValidationError);
});

test("parseCombineBody rejects more than MAX_COMBINE_GROUPS groups", () => {
  const groups = Array.from({ length: MAX_COMBINE_GROUPS + 1 }, () => ({ performerIds: [A, B], keepId: A }));
  expect(() => parseCombineBody({ groups })).toThrow(ValidationError);
});

test("parseCombineBody rejects more than MAX_GROUP_MEMBERS ids in one group", () => {
  const performerIds = Array.from(
    { length: MAX_GROUP_MEMBERS + 1 },
    (_, i) => `${(i + 1).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
  );
  expect(() => parseCombineBody({ groups: [{ performerIds, keepId: performerIds[0] }] })).toThrow(ValidationError);
});

test("matchRequestedGroups returns the computed groups in request order when every set matches", () => {
  const computed = [group("ava", [A, B]), group("bo", [C, A])];
  const matched = matchRequestedGroups(
    [{ performerIds: [A, C], keepId: C }, { performerIds: [B, A], keepId: A }],
    computed,
  );
  expect(matched?.map((g) => g.key)).toEqual(["bo", "ava"]);
});

test.each([
  ["an id set that matches no group", [{ performerIds: [A, C], keepId: A }], [group("ava", [A, B])]],
  ["a partial set", [{ performerIds: [A, B], keepId: A }], [group("ava", [A, B, C])]],
  [
    "a blocked group",
    [{ performerIds: [A, B], keepId: A }],
    [group("ava", [A, B], { reason: "collision", castId: "ct", roleId: "r" })],
  ],
  [
    "the same group twice",
    [{ performerIds: [A, B], keepId: A }, { performerIds: [B, A], keepId: A }],
    [group("ava", [A, B])],
  ],
  ["a keeper that does not match the computed keeper", [{ performerIds: [A, B], keepId: B }], [group("ava", [A, B])]],
])("matchRequestedGroups returns null for %s", (_label, requested, computed) => {
  expect(matchRequestedGroups(requested, computed)).toBeNull();
});

test("toCombineRequest sends only selected, unblocked groups with every member id and the keeper", () => {
  const groups = [
    group("ava", [A, B]),
    group("bo", [C, A], { reason: "collision", castId: "ct", roleId: "r" }),
    group("cy", [B, C]),
  ];
  expect(toCombineRequest(groups, new Set(["ava", "bo"]))).toEqual([{ performerIds: [A, B], keepId: A }]);
});

test("describeCombineCounts pluralizes", () => {
  expect(describeCombineCounts({ groups: 1, castingsMoved: 2, measurementsFilled: 1, performersRemoved: 1 })).toBe(
    "Combined 1 name; 1 measurement carried over.",
  );
  expect(describeCombineCounts({ groups: 3, castingsMoved: 9, measurementsFilled: 0, performersRemoved: 6 })).toBe(
    "Combined 3 names; 0 measurements carried over.",
  );
});
