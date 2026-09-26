import { expect, test } from "vitest";
import { CAST_COLORS, castColorHex } from "@/lib/cast-colors";

test("pink and orange are in the palette after the original six", () => {
  expect(CAST_COLORS.map((c) => c.token)).toEqual(["slate", "red", "gold", "blue", "green", "plum", "pink", "orange"]);
  expect(castColorHex("pink")).toBe("#c2577f");
  expect(castColorHex("orange")).toBe("#c8652a");
});

test("an unknown token falls back to slate", () => {
  expect(castColorHex("nope")).toBe("#64748b");
});
