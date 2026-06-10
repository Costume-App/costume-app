import { expect, test } from "vitest";
import { splitHeight, combineHeight, formatHeight } from "@/lib/height";

test("splitHeight breaks total inches into feet and inches", () => {
  expect(splitHeight(72)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(65)).toEqual({ feet: 5, inches: 5 });
  expect(splitHeight(5)).toEqual({ feet: 0, inches: 5 });
});

test("splitHeight rounds to the nearest whole inch and clamps negatives to 0", () => {
  expect(splitHeight(72.4)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(71.5)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(-3)).toEqual({ feet: 0, inches: 0 });
});

test("combineHeight converts feet and inches to total inches", () => {
  expect(combineHeight(6, 0)).toBe(72);
  expect(combineHeight(5, 5)).toBe(65);
  expect(combineHeight(0, 5)).toBe(5);
});

test("combineHeight and splitHeight round-trip", () => {
  for (const n of [0, 5, 60, 65, 72, 77]) {
    const { feet, inches } = splitHeight(n);
    expect(combineHeight(feet, inches)).toBe(n);
  }
});

test("formatHeight renders feet and inches", () => {
  expect(formatHeight(72)).toBe("6'0\"");
  expect(formatHeight(65)).toBe("5'5\"");
  expect(formatHeight(5)).toBe("0'5\"");
});
