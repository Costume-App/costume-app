import { expect, test } from "vitest";
import { buildDraft } from "@/lib/cast-import/match";
import { inferCastList } from "@/lib/cast-import/infer";
import { STARCATCHER_SHAPED } from "@/lib/cast-import/__fixtures__/starcatcher-shaped";
import type { ExistingData, Inferred } from "@/lib/cast-import/types";

const MAIN = { id: "11111111-1111-4111-8111-111111111111", name: "Main Cast", color: "slate", isDefault: true };
const empty = (over: Partial<ExistingData> = {}): ExistingData => ({ casts: [MAIN], roles: [], performers: [], castings: [], ...over });

test("a fresh production: everything new, unnamed cast goes to the default cast", () => {
  const draft = buildDraft(inferCastList(STARCATCHER_SHAPED), empty());
  expect(draft.casts).toEqual([{ key: "c0", label: null, target: { kind: "existing", castId: MAIN.id } }]);
  expect(draft.roles).toHaveLength(14);
  expect(draft.roles[0]).toEqual({ key: "r0", sourceName: "Alf", target: { kind: "new", name: "Alf", isEnsemble: false } });
  expect(draft.roles.find((r) => r.sourceName === "Pirates")!.target).toEqual({ kind: "new", name: "Pirates", isEnsemble: true });
  expect(draft.performers).toHaveLength(13);
  expect(draft.performers.every((p) => p.target.kind === "new" && p.candidateIds.length === 0)).toBe(true);
  expect(draft.castings).toHaveLength(31);
  expect(draft.castings[0]).toEqual({ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" });
});

test("one person across roles is one performer key; a shared surname stays two people", () => {
  const draft = buildDraft(inferCastList(STARCATCHER_SHAPED), empty());
  const fay = draft.performers.find((p) => p.sourceName === "Fay Moreno")!;
  expect(draft.castings.filter((c) => c.performerKey === fay.key)).toHaveLength(5);
  const pikes = draft.performers.filter((p) => p.sourceName.endsWith("Pike"));
  expect(pikes.map((p) => p.sourceName)).toEqual(["Rowan Pike", "Jules Pike"]);
});

test("existing roles match by normalized name", () => {
  const inferred: Inferred = {
    castLabels: [],
    roles: [{ name: "Mrs. Bumbrake", isEnsemble: false, castings: [] }],
  };
  const role = { id: "22222222-2222-4222-8222-222222222222", name: "mrs bumbrake", isEnsemble: false };
  const draft = buildDraft(inferred, empty({ roles: [role] }));
  expect(draft.roles).toEqual([{ key: "r0", sourceName: "Mrs. Bumbrake", target: { kind: "existing", roleId: role.id } }]);
});

test("cast labels match existing casts; unknown labels become new casts", () => {
  const red = { id: "33333333-3333-4333-8333-333333333333", name: "Red Cast", color: "red", isDefault: false };
  const inferred: Inferred = {
    castLabels: ["red cast", "Blue"],
    roles: [
      {
        name: "Annie",
        isEnsemble: false,
        castings: [
          { castLabel: "red cast", performerName: "Jane Smith", assignment: "primary" },
          { castLabel: "Blue", performerName: "Kim Lee", assignment: "primary" },
        ],
      },
    ],
  };
  const draft = buildDraft(inferred, empty({ casts: [MAIN, red] }));
  expect(draft.casts).toEqual([
    { key: "c0", label: "red cast", target: { kind: "existing", castId: red.id } },
    { key: "c1", label: "Blue", target: { kind: "new", name: "Blue" } },
  ]);
  expect(draft.castings.map((c) => c.castKey)).toEqual(["c0", "c1"]);
});

test("exactly one existing performer with the name is reused; two with the same name are never guessed", () => {
  const ben = { id: "44444444-4444-4444-8444-444444444444", name: "Ben Ortiz" };
  const kitA = { id: "55555555-5555-4555-8555-555555555555", name: "Kit Varga" };
  const kitB = { id: "66666666-6666-4666-8666-666666666666", name: "kit varga" };
  const inferred: Inferred = {
    castLabels: [null],
    roles: [
      {
        name: "Mermaids",
        isEnsemble: true,
        castings: [
          { castLabel: null, performerName: "Ben Ortiz", assignment: "ensemble" },
          { castLabel: null, performerName: "Kit Varga", assignment: "ensemble" },
        ],
      },
    ],
  };
  const draft = buildDraft(inferred, empty({ performers: [ben, kitA, kitB] }));
  expect(draft.performers).toEqual([
    { key: "p0", sourceName: "Ben Ortiz", target: { kind: "existing", performerId: ben.id }, candidateIds: [ben.id] },
    { key: "p1", sourceName: "Kit Varga", target: { kind: "new", name: "Kit Varga" }, candidateIds: [kitA.id, kitB.id] },
  ]);
});

test("without a default-flagged cast the first cast is used; with no casts a new Main Cast is proposed", () => {
  const inferred: Inferred = {
    castLabels: [null],
    roles: [{ name: "Alf", isEnsemble: false, castings: [{ castLabel: null, performerName: "Ada", assignment: "primary" }] }],
  };
  const first = { ...MAIN, isDefault: false };
  expect(buildDraft(inferred, empty({ casts: [first] })).casts[0].target).toEqual({ kind: "existing", castId: first.id });
  expect(buildDraft(inferred, empty({ casts: [] })).casts[0].target).toEqual({ kind: "new", name: "Main Cast" });
});
