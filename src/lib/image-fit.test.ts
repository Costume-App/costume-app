import { expect, test } from "vitest";
import { fitWithinMax } from "@/lib/image-fit";

test("landscape scales by width", () => {
  expect(fitWithinMax(2000, 1000, 800)).toEqual({ width: 800, height: 400 });
});

test("portrait scales by height", () => {
  expect(fitWithinMax(1000, 2000, 800)).toEqual({ width: 400, height: 800 });
});

test("square scales both", () => {
  expect(fitWithinMax(1600, 1600, 800)).toEqual({ width: 800, height: 800 });
});

test("does not upscale smaller images", () => {
  expect(fitWithinMax(500, 300, 800)).toEqual({ width: 500, height: 300 });
});
