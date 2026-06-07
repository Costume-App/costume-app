import { expect, test } from "vitest";
import { aggregateMeasureStatus } from "@/lib/measurement-aggregate";

test("empty list aggregates to none", () => {
  expect(aggregateMeasureStatus([])).toBe("none");
});

test("all complete aggregates to complete", () => {
  expect(aggregateMeasureStatus(["complete", "complete"])).toBe("complete");
});

test("all none aggregates to none", () => {
  expect(aggregateMeasureStatus(["none", "none"])).toBe("none");
});

test("a mix aggregates to partial", () => {
  expect(aggregateMeasureStatus(["none", "complete"])).toBe("partial");
  expect(aggregateMeasureStatus(["partial"])).toBe("partial");
  expect(aggregateMeasureStatus(["complete", "partial"])).toBe("partial");
});
