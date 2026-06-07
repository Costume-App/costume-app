import { expect, test } from "vitest";
import { parsePersisted } from "@/lib/use-persistent-state";

test("parsePersisted returns initial for null", () => {
  expect(parsePersisted(null, "fallback")).toBe("fallback");
  expect(parsePersisted(null, false)).toBe(false);
});

test("parsePersisted returns the parsed value for valid JSON", () => {
  expect(parsePersisted("true", false)).toBe(true);
  expect(parsePersisted('"ideas"', "none")).toBe("ideas");
  expect(parsePersisted('"cast_1"', "")).toBe("cast_1");
});

test("parsePersisted falls back to initial for malformed JSON", () => {
  expect(parsePersisted("not json", "x")).toBe("x");
  expect(parsePersisted("{bad", true)).toBe(true);
});
