import { expect, test, describe } from "vitest";
import {
  estimateSkirtYardage,
  parseWidthInches,
  isSkirtConstruction,
  SKIRT_CONSTRUCTIONS,
  CONSTRUCTION_LABELS,
} from "@/lib/fabric/skirt-yardage";

// The three anchors from the spec. The first is a plausibility check, not a
// validation: Nada guesstimated 4 yards ("anywhere from 2.5 to 4 yards... you
// estimated 4 yards. That's good" / "a full circle skirt with gathering is
// going to be 4. 4 Yards. I always guesstimate my yards.") for a different,
// undimensioned performer — 6-foot, 190 lb, roughly a 45" waist, no skirt
// length ever stated. The 27"/32" dimensions below come from a separate, later
// call and were never priced against that performer or any real garment; the
// raw geometry (4.14 before allowance) merely lands inside her guesstimated
// range. Applying this same geometry to the performer she actually described
// gives roughly 5.75-6.5 yd — well above her range. If this test changes, the
// change still needs her eyes (it's the only real-world data point this module
// has), but do not describe it as validated.
describe("worked anchors", () => {
  test("full circle, 27\" waist, 32\" length, 45\" fabric", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.yards).toBe(4.75);
    expect(r.warning).toBeUndefined();
  });

  test("full circle, 26\" waist, 20\" length, 60\" fabric", () => {
    expect(
      estimateSkirtYardage({
        construction: "full_circle",
        waistInches: 26,
        lengthInches: 20,
        fabricWidthInches: 60,
      }).yards,
    ).toBe(1.75);
  });

  test("gathered at 3x fullness, 27\" waist, 32\" length, 45\" fabric", () => {
    expect(
      estimateSkirtYardage({
        construction: "gathered",
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
        fullness: 3,
      }).yards,
    ).toBe(2.25);
  });
});

describe("panel layout branches", () => {
  // Narrow: one panel per row, so all four stack -> 4R.
  test("fabric narrower than 2R uses four rows", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.steps.join(" ")).toContain("1 per row");
    expect(r.steps.join(" ")).toContain("4 rows");
  });

  // Middle: the whole circle fits as one square -> 2R. This is the common case.
  test("fabric at least 2R uses two rows", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 26,
      lengthInches: 20,
      fabricWidthInches: 60,
    });
    expect(r.steps.join(" ")).toContain("2 per row");
    expect(r.steps.join(" ")).toContain("2 rows");
  });

  // Wide: all four panels fit in one row -> R.
  test("fabric at least 4R uses one row", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 25.13,
      lengthInches: 8,
      fabricWidthInches: 60,
    });
    expect(r.steps.join(" ")).toContain("4 per row");
    expect(r.steps.join(" ")).toContain("1 row");
  });
});

describe("constructions", () => {
  test("panel count follows the circle fraction", () => {
    const at = (construction: "full_circle" | "three_quarter_circle" | "half_circle") =>
      estimateSkirtYardage({
        construction,
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
      }).steps.join(" ");
    expect(at("full_circle")).toContain("4 panels");
    expect(at("three_quarter_circle")).toContain("3 panels");
    expect(at("half_circle")).toContain("2 panels");
  });

  test("a smaller circle fraction needs less fabric", () => {
    const yards = (construction: "full_circle" | "half_circle") =>
      estimateSkirtYardage({
        construction,
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
      }).yards;
    expect(yards("half_circle")).toBeLessThan(yards("full_circle"));
  });

  test("gathered without fullness defaults to 2x and says so", () => {
    const r = estimateSkirtYardage({
      construction: "gathered",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.steps.join(" ")).toContain("assuming 2");
    expect(r.yards).toBeGreaterThan(0);
  });

  test("fullness is ignored for circle constructions", () => {
    const withF = estimateSkirtYardage({
      construction: "full_circle", waistInches: 27, lengthInches: 32,
      fabricWidthInches: 45, fullness: 3,
    });
    const withoutF = estimateSkirtYardage({
      construction: "full_circle", waistInches: 27, lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(withF.yards).toBe(withoutF.yards);
  });
});

describe("edge cases", () => {
  test("a panel wider than the fabric warns and still returns a yardage", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 30,
      lengthInches: 60,
      fabricWidthInches: 36,
    });
    expect(r.warning).toContain("piecing");
    expect(Number.isFinite(r.yards)).toBe(true);
    expect(r.yards).toBeGreaterThan(0);
  });

  // Pinned: a pieced panel must scale the row count (and so the yardage) by how
  // many fabric widths it takes to cover the panel, not just clamp perRow to 1
  // and otherwise treat it like the panel fit. Before this fix, this exact case
  // returned 8.25 yd — identical to a panel that fits in one width, silently
  // ignoring the extra fabric piecing consumes.
  test("a panel needing two fabric widths doubles the row count, not just clamps perRow", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 30,
      lengthInches: 60,
      fabricWidthInches: 36,
    });
    expect(r.yards).toBe(16.25);
    expect(r.steps.join(" ")).toMatch(/pieced|piecing/i);
    expect(r.warning).toContain("2 fabric widths");
  });

  test.each([
    ["waist", { waistInches: 0 }],
    ["length", { lengthInches: -5 }],
    ["width", { fabricWidthInches: Number.NaN }],
  ])("throws on a non-positive %s", (_label, patch) => {
    expect(() =>
      estimateSkirtYardage({
        construction: "full_circle",
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
        ...patch,
      }),
    ).toThrow();
  });

  test.each([
    ["fullness 0", { construction: "gathered" as const, fullness: 0 }],
    ["fullness -2", { construction: "gathered" as const, fullness: -2 }],
    ["fullness NaN", { construction: "gathered" as const, fullness: Number.NaN }],
  ])("throws on invalid %s", (_label, patch) => {
    expect(() =>
      estimateSkirtYardage({
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
        ...patch,
      }),
    ).toThrow();
  });

  test("throws when the fabric is narrower than the selvage allowance", () => {
    expect(() =>
      estimateSkirtYardage({
        construction: "gathered", waistInches: 27, lengthInches: 32, fabricWidthInches: 2,
      }),
    ).toThrow();
  });

  test("every successful call explains itself", () => {
    for (const construction of SKIRT_CONSTRUCTIONS) {
      const r = estimateSkirtYardage({
        construction, waistInches: 27, lengthInches: 32, fabricWidthInches: 45, fullness: 2,
      });
      expect(r.steps.length, `no steps for ${construction}`).toBeGreaterThan(2);
      expect(r.yards).toBeGreaterThan(0);
    }
  });
});

describe("constants are pinned", () => {
  test("waste allowance is exactly 10% and shown honestly", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    // The step text must show the actual constant, not a range or approximation.
    expect(r.steps.join(" ")).toContain("10% allowance");
  });

  test("gathered waste allowance is also exactly 10%", () => {
    const r = estimateSkirtYardage({
      construction: "gathered",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
      fullness: 3,
    });
    expect(r.steps.join(" ")).toContain("10% allowance");
  });
});

describe("helpers", () => {
  test.each([
    ['45"', 45],
    ["60", 60],
    ["  54 in  ", 54],
    ["45.5\"", 45.5],
    ["", null],
    [null, null],
    ["wide", null],
    // "115cm" is a real width, just not in inches — reading its leading number
    // as inches would be a 47% under-buy. No dress-fabric bolt runs this wide,
    // so implausible widths are rejected rather than trusted.
    ["115cm", null],
    ["100", 100],
    ["101", null],
  ])("parseWidthInches(%p) -> %p", (raw, expected) => {
    expect(parseWidthInches(raw as string | null)).toBe(expected);
  });

  test("isSkirtConstruction accepts only the four known values", () => {
    expect(isSkirtConstruction("full_circle")).toBe(true);
    expect(isSkirtConstruction("gathered")).toBe(true);
    expect(isSkirtConstruction("a_line")).toBe(false);
    expect(isSkirtConstruction(null)).toBe(false);
  });

  test("every construction has a label and appears in the picker order", () => {
    for (const c of SKIRT_CONSTRUCTIONS) expect(CONSTRUCTION_LABELS[c]).toBeTruthy();
    expect(SKIRT_CONSTRUCTIONS).toHaveLength(4);
  });
});
