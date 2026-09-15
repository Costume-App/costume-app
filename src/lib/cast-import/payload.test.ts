import { expect, test } from "vitest";
import { parseApplyPayload, toApplyPayload } from "@/lib/cast-import/payload";
import { ValidationError } from "@/lib/errors";
import type { Draft } from "@/lib/cast-import/types";

const CAST = "11111111-1111-4111-8111-111111111111";

const draft: Draft = {
  casts: [
    { key: "c0", label: null, target: { kind: "existing", castId: CAST } },
    { key: "c1", label: "Blue", target: { kind: "new", name: "Blue" } }, // unreferenced
  ],
  roles: [{ key: "r0", sourceName: "Narrator", target: { kind: "new", name: "Narrator", isEnsemble: false } }],
  performers: [
    { key: "p0", sourceName: "Ada Finch", target: { kind: "new", name: "Ada Finch" }, candidateIds: [] },
    { key: "p1", sourceName: "Removed", target: { kind: "new", name: "Removed" }, candidateIds: [] }, // unreferenced
  ],
  castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }],
};

test("toApplyPayload strips review-only fields and drops unreferenced casts and performers", () => {
  expect(toApplyPayload(draft)).toEqual({
    casts: [{ key: "c0", target: { kind: "existing", castId: CAST } }],
    roles: [{ key: "r0", target: { kind: "new", name: "Narrator", isEnsemble: false } }],
    performers: [{ key: "p0", target: { kind: "new", name: "Ada Finch" } }],
    castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }],
  });
});

test("parseApplyPayload accepts a valid payload unchanged", () => {
  const body = JSON.parse(JSON.stringify(toApplyPayload(draft)));
  expect(parseApplyPayload(body)).toEqual(toApplyPayload(draft));
});

const invalid = (mutate: (p: ReturnType<typeof toApplyPayload>) => unknown) => {
  const p = JSON.parse(JSON.stringify(toApplyPayload(draft)));
  return () => parseApplyPayload(mutate(p) ?? p);
};

test("parseApplyPayload rejects malformed shapes with a ValidationError", () => {
  expect(() => parseApplyPayload(null)).toThrow(ValidationError);
  expect(() => parseApplyPayload([])).toThrow(ValidationError);
  expect(invalid((p) => { p.casts[0].target = { kind: "existing", castId: "not-a-uuid" }; })).toThrow(ValidationError);
  expect(invalid((p) => { (p.roles[0].target as { kind: string }).kind = "maybe"; })).toThrow(ValidationError);
  expect(invalid((p) => { (p.castings[0] as { assignment: string }).assignment = "lead"; })).toThrow(ValidationError);
  expect(invalid((p) => { p.castings.push({ ...p.castings[0] }); })).toThrow("Invalid import. Reload and try again.");
  expect(invalid((p) => { delete (p as { performers?: unknown }).performers; })).toThrow(ValidationError);
});

test("parseApplyPayload enforces the size caps", () => {
  const p = JSON.parse(JSON.stringify(toApplyPayload(draft)));
  p.castings = Array.from({ length: 501 }, (_, i) => ({ ...p.castings[0], key: `k${i}` }));
  expect(() => parseApplyPayload(p)).toThrow("An import can include at most 500 castings.");
});
