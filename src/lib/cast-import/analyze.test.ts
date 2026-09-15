import { expect, test } from "vitest";
import { analyzeImport, STALE_IMPORT_MESSAGE } from "@/lib/cast-import/analyze";
import { buildDraft } from "@/lib/cast-import/match";
import { inferCastList } from "@/lib/cast-import/infer";
import { STARCATCHER_SHAPED } from "@/lib/cast-import/__fixtures__/starcatcher-shaped";
import type { ApplyPayload, ExistingData } from "@/lib/cast-import/types";

const CAST = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const PERF = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

const existing = (over: Partial<ExistingData> = {}): ExistingData => ({
  casts: [{ id: CAST, name: "Main Cast", color: "slate", isDefault: true }],
  roles: [],
  performers: [],
  castings: [],
  ...over,
});

// One cast, one role, performers p0/p1; tests override castings/targets.
const payload = (over: Partial<ApplyPayload> = {}): ApplyPayload => ({
  casts: [{ key: "c0", target: { kind: "existing", castId: CAST } }],
  roles: [{ key: "r0", target: { kind: "existing", roleId: ROLE } }],
  performers: [
    { key: "p0", target: { kind: "existing", performerId: PERF } },
    { key: "p1", target: { kind: "new", name: "Kim Lee" } },
  ],
  castings: [],
  ...over,
});

const withRole = (isEnsemble = false) =>
  existing({
    roles: [{ id: ROLE, name: "Annie", isEnsemble }],
    performers: [{ id: PERF, name: "Jane Smith" }, { id: OTHER, name: "Old Lead" }],
  });

test("a fresh Starcatcher-shaped draft has no conflicts and counts everything", () => {
  const ex = existing();
  const result = analyzeImport(buildDraft(inferCastList(STARCATCHER_SHAPED), ex), ex);
  expect(result.conflicts).toEqual([]);
  expect(result.counts).toEqual({ casts: 0, roles: 14, performers: 13, castings: 31 });
});

test("castings that already exist are skipped and not counted", () => {
  const ex = { ...withRole(), castings: [{ castId: CAST, roleId: ROLE, performerId: PERF, assignment: "understudy" as const }] };
  const result = analyzeImport(
    payload({ castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }] }),
    ex,
  );
  expect([...result.alreadyCast]).toEqual(["k0"]);
  expect(result.conflicts).toEqual([]);
  expect(result.counts.castings).toBe(0);
});

test("the same person twice in a role and cast is a duplicate, not a conflict", () => {
  const result = analyzeImport(
    payload({
      castings: [
        { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "primary" },
        { key: "k1", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "understudy" },
      ],
    }),
    withRole(),
  );
  expect([...result.duplicates]).toEqual(["k1"]);
  expect(result.conflicts).toEqual([]);
  expect(result.counts).toEqual({ casts: 0, roles: 0, performers: 1, castings: 1 });
});

test("a new primary where the role already has a different primary is a conflict", () => {
  const ex = { ...withRole(), castings: [{ castId: CAST, roleId: ROLE, performerId: OTHER, assignment: "primary" as const }] };
  const result = analyzeImport(
    payload({ castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "primary" }] }),
    ex,
  );
  expect(result.conflicts).toEqual([
    {
      kind: "existing_primary",
      message: "Annie already has a primary in this cast — make this person an understudy or remove them.",
      castingKeys: ["k0"],
      roleKey: "r0",
    },
  ]);
});

test("two primaries for the same role and cast in one import is a conflict", () => {
  const result = analyzeImport(
    payload({
      castings: [
        { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" },
        { key: "k1", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "primary" },
      ],
    }),
    withRole(),
  );
  expect(result.conflicts.map((c) => [c.kind, c.castingKeys])).toEqual([["duplicate_primary", ["k0", "k1"]]]);
});

test("ensemble castings into an existing regular role are a type mismatch (and vice versa)", () => {
  const castings = [
    { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "ensemble" as const },
    { key: "k1", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "ensemble" as const },
  ];
  const regular = analyzeImport(payload({ castings }), withRole(false));
  expect(regular.conflicts).toEqual([
    {
      kind: "role_type_mismatch",
      message: "Annie isn't an ensemble role, so each person needs to be primary or understudy.",
      castingKeys: ["k0", "k1"],
      roleKey: "r0",
    },
  ]);
  const ensemble = analyzeImport(
    payload({ castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }] }),
    withRole(true),
  );
  expect(ensemble.conflicts[0].message).toBe("Annie is an ensemble role, so no one in it can be primary or understudy.");
});

test("blank or over-long new names are conflicts; unreferenced performers are ignored", () => {
  const result = analyzeImport(
    payload({
      roles: [{ key: "r0", target: { kind: "new", name: "  ", isEnsemble: false } }],
      performers: [
        { key: "p0", target: { kind: "new", name: "x".repeat(101) } },
        { key: "p1", target: { kind: "new", name: "" } }, // not referenced by any casting
      ],
      castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }],
    }),
    existing(),
  );
  expect(result.conflicts.map((c) => [c.kind, c.message, c.castingKeys])).toEqual([
    ["invalid_name", "Every new role needs a name.", []],
    ["invalid_name", "Performer names must be 100 characters or fewer.", ["k0"]],
  ]);
});

test("ids or keys that don't exist produce one stale-import conflict", () => {
  const result = analyzeImport(
    payload({
      roles: [{ key: "r0", target: { kind: "existing", roleId: OTHER } }],
      castings: [
        { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p1", assignment: "primary" },
        { key: "k1", castKey: "c9", roleKey: "r0", performerKey: "p1", assignment: "primary" },
      ],
    }),
    existing(),
  );
  expect(result.conflicts).toEqual([{ kind: "unknown_reference", message: STALE_IMPORT_MESSAGE, castingKeys: [] }]);
});
