import { expect, test } from "vitest";
import { inferCastList } from "@/lib/cast-import/infer";
import { STARCATCHER_SHAPED } from "@/lib/cast-import/__fixtures__/starcatcher-shaped";
import type { RawEntry } from "@/lib/cast-import/types";

const entry = (character: string, names: [string, RawEntry["performers"][number]["mark"]][], extra: Partial<RawEntry> = {}): RawEntry => ({
  character,
  cast: null,
  group_label: false,
  performers: names.map(([name, mark]) => ({ name, mark })),
  ...extra,
});

test("a single unmarked name is the primary of a regular role", () => {
  const out = inferCastList({ casts: [], entries: [entry("Alf", [["Ada Finch", "unmarked"]])] });
  expect(out.castLabels).toEqual([null]);
  expect(out.roles).toEqual([
    { name: "Alf", isEnsemble: false, castings: [{ castLabel: null, performerName: "Ada Finch", assignment: "primary" }] },
  ]);
});

test("two or more unmarked names make an ensemble role", () => {
  const out = inferCastList({ casts: [], entries: [entry("Mermaid Trio", [["A One", "unmarked"], ["B Two", "unmarked"], ["C Three", "unmarked"]])] });
  expect(out.roles[0].isEnsemble).toBe(true);
  expect(out.roles[0].castings.map((c) => c.assignment)).toEqual(["ensemble", "ensemble", "ensemble"]);
});

test("understudy marks keep the role regular: first unmarked is primary", () => {
  const out = inferCastList({ casts: [], entries: [entry("Annie", [["Jane Smith", "unmarked"], ["Kim Lee", "understudy"]])] });
  expect(out.roles[0].isEnsemble).toBe(false);
  expect(out.roles[0].castings.map((c) => [c.performerName, c.assignment])).toEqual([
    ["Jane Smith", "primary"],
    ["Kim Lee", "understudy"],
  ]);
});

test("an explicit primary mark keeps the role regular and wins over an earlier unmarked name", () => {
  const out = inferCastList({ casts: [], entries: [entry("Annie", [["Kim Lee", "unmarked"], ["Jane Smith", "primary"]])] });
  expect(out.roles[0].isEnsemble).toBe(false);
  expect(out.roles[0].castings.map((c) => [c.performerName, c.assignment])).toEqual([
    ["Kim Lee", "understudy"],
    ["Jane Smith", "primary"],
  ]);
});

test("group_label makes even a single name an ensemble casting", () => {
  const out = inferCastList({ casts: [], entries: [entry("Chorus", [["Solo Person", "unmarked"]], { group_label: true })] });
  expect(out.roles[0]).toMatchObject({ isEnsemble: true, castings: [{ assignment: "ensemble" }] });
});

test("the same character across casts becomes one role with castings in each cast", () => {
  const out = inferCastList({
    casts: ["Red", "Blue"],
    entries: [
      entry("Annie", [["Jane Smith", "unmarked"]], { cast: "Red" }),
      entry("annie", [["Kim Lee", "unmarked"]], { cast: "Blue Cast" }),
    ],
  });
  expect(out.castLabels).toEqual(["Red", "Blue Cast"]);
  expect(out.roles).toHaveLength(1);
  expect(out.roles[0].castings).toEqual([
    { castLabel: "Red", performerName: "Jane Smith", assignment: "primary" },
    { castLabel: "Blue Cast", performerName: "Kim Lee", assignment: "primary" },
  ]);
});

test("a role that is ensemble in any cast is ensemble in every cast", () => {
  const out = inferCastList({
    casts: ["Red", "Blue"],
    entries: [
      entry("Orphans", [["A One", "unmarked"], ["B Two", "unmarked"]], { cast: "Red" }),
      entry("Orphans", [["C Three", "unmarked"]], { cast: "Blue" }),
    ],
  });
  expect(out.roles[0].isEnsemble).toBe(true);
  expect(out.roles[0].castings.map((c) => c.assignment)).toEqual(["ensemble", "ensemble", "ensemble"]);
});

test("repeated characters in one cast merge, duplicate names collapse, names are cleaned", () => {
  const out = inferCastList({
    casts: [],
    entries: [
      entry(" Pirates ", [["Ann  Lee", "unmarked"], ["Bo Park", "unmarked"]]),
      entry("pirates", [["ann lee", "unmarked"], ["Cy Moss", "unmarked"]]),
    ],
  });
  expect(out.roles).toHaveLength(1);
  expect(out.roles[0].name).toBe("Pirates");
  expect(out.roles[0].castings.map((c) => c.performerName)).toEqual(["Ann Lee", "Bo Park", "Cy Moss"]);
});

test("blank characters are skipped; a character with nobody cast is kept without adding a cast label", () => {
  const out = inferCastList({
    casts: [],
    entries: [entry("   ", [["Ghost", "unmarked"]]), entry("Narrator", []), entry("Mack", [["  ", "unmarked"]])],
  });
  expect(out.roles.map((r) => [r.name, r.castings.length])).toEqual([
    ["Narrator", 0],
    ["Mack", 0],
  ]);
  expect(out.castLabels).toEqual([]);
});

test("the Starcatcher-shaped list infers 14 roles, 5 ensembles and 31 castings", () => {
  const out = inferCastList(STARCATCHER_SHAPED);
  expect(out.castLabels).toEqual([null]);
  expect(out.roles).toHaveLength(14);
  expect(out.roles.filter((r) => r.isEnsemble).map((r) => r.name)).toEqual([
    "Grempkin Flashback Vocalists",
    "Mermaid Trio",
    "Mermaids",
    "Pirates",
    "Sailors",
  ]);
  expect(out.roles.flatMap((r) => r.castings)).toHaveLength(31);
  const pirates = out.roles.find((r) => r.name === "Pirates")!;
  expect(pirates.castings.map((c) => c.performerName)).toContain("Rowan Pike");
  expect(out.roles.find((r) => r.name === "Alf")!.castings[0].assignment).toBe("primary");
});
