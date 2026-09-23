import { expect, test } from "vitest";
import { fieldStatus, preChecked } from "@/lib/measurement-import/status";
import type { DraftField } from "@/lib/measurement-import/types";

const num = (valueNumeric: number | null): DraftField => ({ key: "chest", label: "A chest", raw: "x", valueNumeric, valueText: null });
const text = (valueText: string | null): DraftField => ({ key: "shirt_size", label: "Shirt", raw: "x", valueNumeric: null, valueText });

test("unreadable when the form value could not be parsed", () => {
  expect(fieldStatus(num(null), 36)).toBe("unreadable");
  expect(fieldStatus(num(null), undefined)).toBe("unreadable");
});

test("new when the performer has no saved value", () => {
  expect(fieldStatus(num(36), undefined)).toBe("new");
  expect(fieldStatus(text("M"), undefined)).toBe("new");
});

test("same when the saved value equals the form value", () => {
  expect(fieldStatus(num(36), 36)).toBe("same");
  expect(fieldStatus(num(36), "36")).toBe("same");
  expect(fieldStatus(text("M"), "M")).toBe("same");
  expect(fieldStatus(text("M"), " m ")).toBe("same");
});

test("changed when they differ", () => {
  expect(fieldStatus(num(36), 35)).toBe("changed");
  expect(fieldStatus(text("30/32"), "32/30")).toBe("changed");
});

test("new and changed are pre-checked, same and unreadable are not", () => {
  expect(preChecked("new")).toBe(true);
  expect(preChecked("changed")).toBe(true);
  expect(preChecked("same")).toBe(false);
  expect(preChecked("unreadable")).toBe(false);
});
