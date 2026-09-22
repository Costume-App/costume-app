import { expect, test } from "vitest";
import sample from "@/lib/measurement-import/__fixtures__/sample-form.json";
import { buildDraft } from "@/lib/measurement-import/draft";
import type { DefinitionInfo, ExistingData, RawFormExtraction } from "@/lib/measurement-import/types";

const def = (key: string, order: number, input_type = "number", unit = "in"): DefinitionInfo => ({
  key,
  label: key,
  unit,
  input_type,
  display_order: order,
});

const definitions: DefinitionInfo[] = [
  def("height", 10),
  def("weight", 20, "number", "lb"),
  def("chest", 30),
  def("waist", 40),
  def("hips", 50),
  def("shoulder", 60),
  def("sleeve", 70),
  def("back_length", 80),
  def("inseam", 90),
  def("outseam", 100),
  def("neck", 110),
  def("head", 160),
  def("nape_to_floor", 170),
  def("shirt_size", 180, "text", ""),
  def("pant_size", 190, "text", ""),
  def("shoe_size", 200, "text", ""),
];

const existing: ExistingData = {
  performers: [
    { id: "p1", name: "Sample Performer", notes: null, measurements: { chest: 35 } },
    { id: "p2", name: "Someone Else", notes: null, measurements: {} },
  ],
  definitions,
};

const meta = { id: "d1", fileName: "form.jpg", today: "2026-09-22" };
const extraction = sample as RawFormExtraction;

test("maps the sample form to the app's keys in definition order", () => {
  const draft = buildDraft(extraction, existing, meta);
  expect(draft.id).toBe("d1");
  expect(draft.fileName).toBe("form.jpg");
  expect(draft.name).toBe("Sample Performer");
  expect(draft.castedAs).toBe("Sample Role");
  expect(draft.fields.map((f) => [f.key, f.valueNumeric])).toEqual([
    ["chest", 36],
    ["waist", 31],
    ["hips", 39],
    ["shoulder", 19.5],
    ["sleeve", 24.25],
    ["back_length", 19],
    ["inseam", 29.5],
    ["neck", 14.25],
    ["head", 22.5],
  ]);
  expect(draft.fields[0]).toEqual({ key: "chest", label: "A chest", raw: '36"', valueNumeric: 36, valueText: null });
});

test("matches exactly one same-name performer and lists candidates", () => {
  const draft = buildDraft(extraction, existing, meta);
  expect(draft.performer).toEqual({ kind: "existing", performerId: "p1" });
  expect(draft.candidateIds).toEqual(["p1"]);
});

test("proposes a new performer when the name is unknown or ambiguous", () => {
  const unknown = buildDraft({ ...extraction, name: "  New   Kid " }, existing, meta);
  expect(unknown.performer).toEqual({ kind: "new", name: "New Kid" });
  expect(unknown.candidateIds).toEqual([]);

  const twoSams: ExistingData = {
    ...existing,
    performers: [
      { id: "s1", name: "Sam", notes: null, measurements: {} },
      { id: "s2", name: "sam", notes: null, measurements: {} },
    ],
  };
  const ambiguous = buildDraft({ ...extraction, name: "Sam" }, twoSams, meta);
  expect(ambiguous.performer).toEqual({ kind: "new", name: "Sam" });
  expect(ambiguous.candidateIds).toEqual(["s1", "s2"]);
});

test("a missing name yields an empty new-performer target", () => {
  const draft = buildDraft({ ...extraction, name: null }, existing, meta);
  expect(draft.name).toBeNull();
  expect(draft.performer).toEqual({ kind: "new", name: "" });
});

test("collects unmapped lines, sex, age, contact and loose notes into the notes block", () => {
  const draft = buildDraft(extraction, existing, meta);
  expect(draft.notesToAppend).toBe(
    ["From measurement form, 2026-09-22:", "Hip-ankle: 41.5", "Sh-E: 13", "E-Wr: 11", "Sex: Male", "Crystal - Vest"].join("\n"),
  );
});

test("notes block is empty when nothing is left over", () => {
  const draft = buildDraft(
    { ...extraction, sex: null, notes: [], fields: [{ label: "A chest", value: "36" }] },
    existing,
    meta,
  );
  expect(draft.notesToAppend).toBe("");
});

test("parses height, weight and sizes by definition type", () => {
  const draft = buildDraft(
    {
      ...extraction,
      sizes: { shirt: " M ", pant: "30/32", shoe: "10" },
      fields: [
        { label: "F height", value: "5'8\"" },
        { label: "Weight", value: "140 lbs" },
      ],
    },
    existing,
    meta,
  );
  expect(draft.fields).toEqual([
    { key: "height", label: "F height", raw: "5'8\"", valueNumeric: 68, valueText: null },
    { key: "weight", label: "Weight", raw: "140 lbs", valueNumeric: 140, valueText: null },
    { key: "shirt_size", label: "Shirt", raw: " M ", valueNumeric: null, valueText: "M" },
    { key: "pant_size", label: "Pant", raw: "30/32", valueNumeric: null, valueText: "30/32" },
    { key: "shoe_size", label: "Shoe", raw: "10", valueNumeric: null, valueText: "10" },
  ]);
});

test("keeps an unreadable value as a field with null values, and the first of a repeated key", () => {
  const draft = buildDraft(
    {
      ...extraction,
      sex: null,
      notes: [],
      fields: [
        { label: "A chest", value: "thirty-six" },
        { label: "Chest", value: "36" },
      ],
    },
    existing,
    meta,
  );
  expect(draft.fields).toEqual([{ key: "chest", label: "A chest", raw: "thirty-six", valueNumeric: null, valueText: null }]);
  expect(draft.notesToAppend).toBe("");
});
