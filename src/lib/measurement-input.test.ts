import { describe, expect, test } from "vitest";
import { measurementPayload, parseMeasurementNumber } from "@/lib/measurement-input";

test("text defs save a trimmed string", () => {
  expect(measurementPayload({ key: "shirt_size", unit: "", input_type: "text" }, "  L  ")).toEqual({
    kind: "ok",
    payload: { measurementKey: "shirt_size", unit: "", valueText: "L" },
  });
});

test("number defs save a numeric value", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "30")).toEqual({
    kind: "ok",
    payload: { measurementKey: "waist", unit: "in", valueNumeric: 30 },
  });
});

test("a blank field saves nothing", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "   ")).toEqual({ kind: "blank" });
});

test("an unreadable number is invalid, not saved", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "3O")).toEqual({ kind: "invalid" });
});

describe("parseMeasurementNumber", () => {
  test.each([
    ["30", 30],
    ["34.5", 34.5],
    [".5", 0.5],
    ["34,5", 34.5],
    ["34 1/2", 34.5],
    ["34-1/2", 34.5],
    ["34 3/8", 34.375],
    ["34½", 34.5],
    ["34 ½", 34.5],
    ["34¼", 34.25],
    ["¾", 0.75],
    ["1/2", 0.5],
    ['34.5"', 34.5],
    ["34.5 in", 34.5],
    ["34 in.", 34],
    ["  28  ", 28],
  ])("%j reads as %d", (raw, expected) => {
    expect(parseMeasurementNumber(raw)).toBe(expected);
  });

  test.each(["", "abc", "3O", "34..5", "1/0", "34 1/2 1/4", "-5", "1,000.5", "34/"])("%j is unreadable", (raw) => {
    expect(parseMeasurementNumber(raw)).toBeNull();
  });
});
