import { describe, it, expect } from "vitest";
import { DEMO_PRODUCTIONS, MEASUREMENT_UNITS, showDate, validateFixtures } from "./demo-fixtures.mjs";

describe("showDate", () => {
  it("offsets from a given local day and formats YYYY-MM-DD", () => {
    expect(showDate(10, new Date(2026, 8, 22))).toBe("2026-10-02");
    expect(showDate(-1, new Date(2026, 0, 1))).toBe("2025-12-31");
  });
});

describe("DEMO_PRODUCTIONS", () => {
  it("passes validation", () => {
    expect(() => validateFixtures(DEMO_PRODUCTIONS)).not.toThrow();
  });
  it("uses only known measurement keys", () => {
    for (const p of DEMO_PRODUCTIONS) {
      for (const values of Object.values(p.measurements)) {
        for (const k of Object.keys(values)) expect(MEASUREMENT_UNITS).toHaveProperty(k);
      }
    }
  });
});

describe("validateFixtures", () => {
  it("rejects a casting for a role that does not exist", () => {
    const bad = [{ ...DEMO_PRODUCTIONS[0], cast: [{ role: "Nobody", performer: "X" }] }];
    expect(() => validateFixtures(bad)).toThrow(/Nobody/);
  });
  it("rejects measurements for a performer who is not cast", () => {
    const bad = [{ ...DEMO_PRODUCTIONS[0], measurements: { "Ghost Person": { height: 60 } } }];
    expect(() => validateFixtures(bad)).toThrow(/Ghost Person/);
  });
});
