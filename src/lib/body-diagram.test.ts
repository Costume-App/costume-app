import { expect, test } from "vitest";
import { MEASUREMENT_MARKERS } from "@/lib/body-diagram";

test("covers the dimensional measurements", () => {
  for (const key of ["height", "head", "neck", "shoulder", "chest", "waist", "hips", "sleeve",
    "arm_circumference", "wrist", "thigh", "knee", "inseam", "outseam", "back_length", "nape_to_floor"]) {
    expect(MEASUREMENT_MARKERS[key], key).toBeDefined();
  }
});

test("omits abstract measurements that have no body location", () => {
  for (const key of ["weight", "shirt_size", "pant_size", "shoe_size"]) {
    expect(MEASUREMENT_MARKERS[key]).toBeUndefined();
  }
});

test("every marker has a label, a valid view, and in-range coordinates", () => {
  for (const [key, m] of Object.entries(MEASUREMENT_MARKERS)) {
    expect(m.label.length, key).toBeGreaterThan(0);
    expect(["front", "back"]).toContain(m.view);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(100);
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y).toBeLessThanOrEqual(100);
  }
});

test("every marker has a span line with in-range endpoints", () => {
  for (const [key, m] of Object.entries(MEASUREMENT_MARKERS)) {
    for (const v of [m.line.x1, m.line.y1, m.line.x2, m.line.y2]) {
      expect(v, key).toBeGreaterThanOrEqual(0);
      expect(v, key).toBeLessThanOrEqual(100);
    }
    // A line must have length — not a degenerate point.
    expect(m.line.x1 !== m.line.x2 || m.line.y1 !== m.line.y2, key).toBe(true);
  }
});
