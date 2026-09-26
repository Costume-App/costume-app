import { describe, it, expect } from "vitest";
import { MEASUREMENT_UNITS } from "./demo-fixtures.mjs";
import { ROSA_FORM } from "./demo-measurement-form.mjs";

// Mirrors the text keys demo-productions.mjs treats as non-numeric.
const TEXT_KEYS = new Set(["shirt_size", "pant_size", "shoe_size"]);

describe("ROSA_FORM", () => {
  it("uses a real measurement key for every field", () => {
    for (const field of ROSA_FORM.fields) {
      expect(TEXT_KEYS.has(field.key) || field.key in MEASUREMENT_UNITS).toBe(true);
    }
  });

  it("never repeats a field key", () => {
    const keys = ROSA_FORM.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes at least one fraction value, for handwriting conventions", () => {
    expect(ROSA_FORM.fields.some((f) => /\d \d\/\d/.test(f.value))).toBe(true);
  });

  it("has plausible sizes for an adult woman", () => {
    expect(ROSA_FORM.sizes.shirt).toBeTruthy();
    expect(ROSA_FORM.sizes.pant).toBeTruthy();
    expect(ROSA_FORM.sizes.shoe).toBeTruthy();
  });
});
