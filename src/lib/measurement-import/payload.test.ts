import { expect, test } from "vitest";
import { ValidationError } from "@/lib/errors";
import { parseApplyPayload, toApplyPayload } from "@/lib/measurement-import/payload";
import type { FormDraft } from "@/lib/measurement-import/types";

const draft: FormDraft = {
  id: "d1",
  fileName: "a.jpg",
  name: "Ada Finch",
  castedAs: null,
  performer: { kind: "existing", performerId: "11111111-1111-4111-8111-111111111111" },
  candidateIds: ["11111111-1111-4111-8111-111111111111"],
  fields: [
    { key: "chest", label: "A chest", raw: "36", valueNumeric: 36, valueText: null },
    { key: "waist", label: "B waist", raw: "31", valueNumeric: 31, valueText: null },
    { key: "shirt_size", label: "Shirt", raw: "M", valueNumeric: null, valueText: "M" },
    { key: "hips", label: "C hip", raw: "??", valueNumeric: null, valueText: null },
  ],
  notesToAppend: "From measurement form, 2026-09-22:\nSex: Male",
};

const KEYS = new Set(["chest", "waist", "hips", "shirt_size"]);

test("toApplyPayload keeps only ticked fields and the notes block when ticked", () => {
  const payload = toApplyPayload([draft], { d1: { fields: { chest: true, waist: false, shirt_size: true, hips: true }, notes: true } });
  expect(payload).toEqual({
    forms: [
      {
        performer: { kind: "existing", performerId: "11111111-1111-4111-8111-111111111111" },
        measurements: [
          { key: "chest", valueNumeric: 36, valueText: null },
          { key: "shirt_size", valueNumeric: null, valueText: "M" },
        ],
        notesAppend: "From measurement form, 2026-09-22:\nSex: Male",
      },
    ],
  });
});

test("toApplyPayload drops a draft with nothing ticked and an unticked empty notes block", () => {
  const payload = toApplyPayload([draft], { d1: { fields: {}, notes: false } });
  expect(payload.forms).toEqual([]);
});

test("parseApplyPayload accepts a valid body and cleans a new performer name", () => {
  const payload = parseApplyPayload(
    {
      forms: [
        {
          performer: { kind: "new", name: "  Ada   Finch " },
          measurements: [{ key: "chest", valueNumeric: 36, valueText: null }],
          notesAppend: null,
        },
      ],
    },
    KEYS,
  );
  expect(payload.forms[0].performer).toEqual({ kind: "new", name: "Ada Finch" });
});

test("parseApplyPayload rejects an empty forms array", () => {
  expect(() => parseApplyPayload({ forms: [] }, KEYS)).toThrow(ValidationError);
});

test.each([
  ["not an object", "nope"],
  ["forms missing", {}],
  ["too many forms", { forms: Array.from({ length: 21 }, () => ({ performer: { kind: "new", name: "A" }, measurements: [{ key: "chest", valueNumeric: 1, valueText: null }], notesAppend: null })) }],
  ["unknown key", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "elbow", valueNumeric: 1, valueText: null }], notesAppend: null }] }],
  ["non-finite value", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "chest", valueNumeric: Number.NaN, valueText: null }], notesAppend: null }] }],
  ["zero value", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "chest", valueNumeric: 0, valueText: null }], notesAppend: null }] }],
  ["both values null", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "chest", valueNumeric: null, valueText: null }], notesAppend: null }] }],
  ["text too long", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "shirt_size", valueNumeric: null, valueText: "x".repeat(41) }], notesAppend: null }] }],
  ["empty new name", { forms: [{ performer: { kind: "new", name: "  " }, measurements: [{ key: "chest", valueNumeric: 1, valueText: null }], notesAppend: null }] }],
  ["long new name", { forms: [{ performer: { kind: "new", name: "x".repeat(101) }, measurements: [{ key: "chest", valueNumeric: 1, valueText: null }], notesAppend: null }] }],
  ["bad performer id", { forms: [{ performer: { kind: "existing", performerId: "not-a-uuid" }, measurements: [{ key: "chest", valueNumeric: 1, valueText: null }], notesAppend: null }] }],
  ["notes too long", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [], notesAppend: "x".repeat(2001) }] }],
  ["nothing to write", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [], notesAppend: null }] }],
  ["duplicate key in one form", { forms: [{ performer: { kind: "new", name: "A" }, measurements: [{ key: "chest", valueNumeric: 1, valueText: null }, { key: "chest", valueNumeric: 2, valueText: null }], notesAppend: null }] }],
])("parseApplyPayload rejects %s", (_name, body) => {
  expect(() => parseApplyPayload(body, KEYS)).toThrow(ValidationError);
});
