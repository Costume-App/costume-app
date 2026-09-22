import { expect, test } from "vitest";
import {
  contributes,
  initialSelection,
  MISSING_NAME_MESSAGE,
  orderedEntries,
  reviewBlocks,
  targetChanged,
  type ParseFailure,
} from "@/lib/measurement-import/review";
import type { ExistingData, FormDraft, FormSelection, PerformerTarget } from "@/lib/measurement-import/types";

const ADA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";

const existing: ExistingData = {
  performers: [
    { id: ADA, name: "Ada Finch", notes: null, measurements: { chest: 36, shirt_size: "M" } },
    { id: BEN, name: "Ben Ortiz", notes: null, measurements: {} },
  ],
  definitions: [],
};

function draft(id: string, performer: PerformerTarget, notesToAppend = ""): FormDraft {
  return {
    id,
    fileName: `${id}.jpg`,
    name: null,
    castedAs: null,
    performer,
    candidateIds: [],
    fields: [
      { key: "chest", label: "A chest", raw: "36", valueNumeric: 36, valueText: null },
      { key: "waist", label: "B waist", raw: "31", valueNumeric: 31, valueText: null },
      { key: "shirt_size", label: "Shirt", raw: "L", valueNumeric: null, valueText: "L" },
      { key: "hips", label: "C hip", raw: "??", valueNumeric: null, valueText: null },
    ],
    notesToAppend,
  };
}

const allOn = (d: FormDraft): FormSelection => initialSelection(d, existing);

test("initialSelection ticks new and changed values for an existing performer, not same or unreadable", () => {
  const sel = initialSelection(draft("d1", { kind: "existing", performerId: ADA }, "From form:\nSex: F"), existing);
  expect(sel).toEqual({ fields: { chest: false, waist: true, shirt_size: true, hips: false }, notes: true });
});

test("initialSelection ticks every readable value for a new performer and leaves notes off when there are none", () => {
  const sel = initialSelection(draft("d1", { kind: "new", name: "Cleo" }), existing);
  expect(sel).toEqual({ fields: { chest: true, waist: true, shirt_size: true, hips: false }, notes: false });
});

test("targetChanged is true for a different existing performer or a switch between existing and new", () => {
  expect(targetChanged({ kind: "existing", performerId: ADA }, { kind: "existing", performerId: BEN })).toBe(true);
  expect(targetChanged({ kind: "existing", performerId: ADA }, { kind: "new", name: "Ada" })).toBe(true);
  expect(targetChanged({ kind: "new", name: "Ada" }, { kind: "existing", performerId: ADA })).toBe(true);
});

test("targetChanged is false while typing the new performer name or re-picking the same performer", () => {
  expect(targetChanged({ kind: "new", name: "Cle" }, { kind: "new", name: "Cleo" })).toBe(false);
  expect(targetChanged({ kind: "new", name: "" }, { kind: "new", name: "C" })).toBe(false);
  expect(targetChanged({ kind: "existing", performerId: ADA }, { kind: "existing", performerId: ADA })).toBe(false);
});

test("contributes mirrors the apply payload: a ticked readable field or ticked notes", () => {
  const d = draft("d1", { kind: "new", name: "Cleo" }, "From form:\nx");
  expect(contributes(d, undefined)).toBe(false);
  expect(contributes(d, { fields: {}, notes: false })).toBe(false);
  expect(contributes(d, { fields: { hips: true }, notes: false })).toBe(false);
  expect(contributes(d, { fields: { waist: true }, notes: false })).toBe(true);
  expect(contributes(d, { fields: {}, notes: true })).toBe(true);
  expect(contributes(draft("d2", { kind: "new", name: "Cleo" }), { fields: {}, notes: true })).toBe(false);
});

test("reviewBlocks lists a new performer with no name as missing", () => {
  const d = draft("d1", { kind: "new", name: "  " });
  const blocks = reviewBlocks([d], existing, { d1: allOn(d) });
  expect(blocks).toEqual({ missingName: ["d1"], cards: { d1: MISSING_NAME_MESSAGE } });
});

test("reviewBlocks blocks a new performer whose name is already in the production, ignoring case and spacing", () => {
  const d = draft("d1", { kind: "new", name: " ada  FINCH " });
  const blocks = reviewBlocks([d], existing, { d1: allOn(d) });
  expect(blocks.missingName).toEqual([]);
  expect(blocks.cards).toEqual({ d1: "ada  FINCH is already in this production. Pick them above, or change the name." });
});

test("reviewBlocks blocks two sending forms for the same existing performer", () => {
  const a = draft("d1", { kind: "existing", performerId: BEN });
  const b = draft("d2", { kind: "existing", performerId: BEN });
  const blocks = reviewBlocks([a, b], existing, { d1: allOn(a), d2: allOn(b) });
  const msg = "Another form is also for Ben Ortiz. Remove one, or pick a different performer.";
  expect(blocks.cards).toEqual({ d1: msg, d2: msg });
});

test("reviewBlocks blocks two sending forms that add the same new performer", () => {
  const a = draft("d1", { kind: "new", name: "Cleo Hart" });
  const b = draft("d2", { kind: "new", name: "cleo hart" });
  const blocks = reviewBlocks([a, b], existing, { d1: allOn(a), d2: allOn(b) });
  expect(blocks.cards).toEqual({
    d1: "Another form also adds Cleo Hart as a new performer. Pick a different performer for one of them.",
    d2: "Another form also adds cleo hart as a new performer. Pick a different performer for one of them.",
  });
});

test("reviewBlocks ignores a same-target form that sends nothing, and different targets", () => {
  const a = draft("d1", { kind: "existing", performerId: BEN });
  const b = draft("d2", { kind: "existing", performerId: BEN });
  const c = draft("d3", { kind: "existing", performerId: ADA });
  const blocks = reviewBlocks([a, b, c], existing, { d1: allOn(a), d2: { fields: {}, notes: false }, d3: allOn(c) });
  expect(blocks).toEqual({ missingName: [], cards: {} });
});

const fail = (id: string): ParseFailure => ({ id, fileName: `${id}.jpg`, message: "x", retryable: true });

test("orderedEntries interleaves drafts and failures in upload order", () => {
  const a = draft("a", { kind: "existing", performerId: ADA });
  const c = draft("c", { kind: "existing", performerId: BEN });
  const entries = orderedEntries(["a", "b", "c"], [c, a], [fail("b")]);
  expect(entries.map((e) => (e.kind === "draft" ? `draft:${e.draft.id}` : `failure:${e.failure.id}`))).toEqual([
    "draft:a",
    "failure:b",
    "draft:c",
  ]);
});

test("orderedEntries puts a retried success back in its original slot and skips ids still being read", () => {
  const a = draft("a", { kind: "existing", performerId: ADA });
  const b = draft("b", { kind: "existing", performerId: BEN });
  // b failed first, was retried and its draft appended last; d is in flight.
  const entries = orderedEntries(["b", "a", "d"], [a, b], []);
  expect(entries.map((e) => (e.kind === "draft" ? e.draft.id : e.failure.id))).toEqual(["b", "a"]);
});
