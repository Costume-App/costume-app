import { expect, test } from "vitest";
import { measurementPayload } from "@/lib/measurement-input";

test("text defs save a trimmed string", () => {
  expect(measurementPayload({ key: "shirt_size", unit: "", input_type: "text" }, "  L  ")).toEqual({
    measurementKey: "shirt_size",
    unit: "",
    valueText: "L",
  });
});

test("number defs save a numeric value", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "30")).toEqual({
    measurementKey: "waist",
    unit: "in",
    valueNumeric: 30,
  });
});

test("a blank field saves nothing", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "   ")).toBeNull();
});
