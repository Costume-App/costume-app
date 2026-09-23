import { expect, test } from "vitest";
import { parseHeight, parseInches, parseTextValue, parseWeight } from "@/lib/measurement-import/values";

test.each([
  ['36"', 36],
  ["31", 31],
  ["29.5", 29.5],
  ["14.25", 14.25],
  ["24 1/4", 24.25],
  ["24¼", 24.25],
  ["1/2", 0.5],
  ["22.5 in", 22.5],
  ["19 inches", 19],
  ["  41.5  ", 41.5],
])("parseInches(%s) is %s", (raw, expected) => {
  expect(parseInches(raw)).toBe(expected);
});

test.each(["", "n/a", "abc", "0", "-3", "36\" or so", "12-14"])("parseInches(%s) is null", (raw) => {
  expect(parseInches(raw)).toBeNull();
});

test.each([
  ["5'8\"", 68],
  ["5' 8", 68],
  ["5 ft 8 in", 68],
  ["5ft8", 68],
  ["5-8", 68],
  ["5'", 60],
  ["5’8”", 68],
  ["68", 68],
  ["68 in", 68],
  ["5'8.5\"", 68.5],
])("parseHeight(%s) is %s", (raw, expected) => {
  expect(parseHeight(raw)).toBe(expected);
});

test.each(["", "5", "5.5", "12", "35", "tall", "9-2"])("parseHeight(%s) is null", (raw) => {
  expect(parseHeight(raw)).toBeNull();
});

test.each([
  ["140", 140],
  ["140 lb", 140],
  ["140lbs", 140],
  ["140 pounds", 140],
  ["102.5", 102.5],
])("parseWeight(%s) is %s", (raw, expected) => {
  expect(parseWeight(raw)).toBe(expected);
});

test.each(["", "0", "heavy", "64 kg"])("parseWeight(%s) is null", (raw) => {
  expect(parseWeight(raw)).toBeNull();
});

test("parseTextValue trims, collapses whitespace and caps at 40 characters", () => {
  expect(parseTextValue("  M  ")).toBe("M");
  expect(parseTextValue("30 /  32")).toBe("30 / 32");
  expect(parseTextValue("")).toBeNull();
  expect(parseTextValue("   ")).toBeNull();
  expect(parseTextValue("x".repeat(50))).toBe("x".repeat(40));
});
