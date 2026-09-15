import { expect, test } from "vitest";
import { cleanName, matchKey } from "@/lib/cast-import/normalize";

test("cleanName trims and collapses whitespace but keeps casing", () => {
  expect(cleanName("  Ada   Finch \n")).toBe("Ada Finch");
  expect(cleanName("LJ Varga")).toBe("LJ Varga");
});

test("matchKey ignores case, spacing and light punctuation", () => {
  expect(matchKey("Mrs. Bumbrake")).toBe(matchKey("mrs  bumbrake"));
  expect(matchKey("O'Neil")).toBe(matchKey("ONeil"));
  expect(matchKey("O’Neil")).toBe(matchKey("oneil"));
});

test("matchKey is full-name exact — a shared surname never matches", () => {
  expect(matchKey("Rowan Pike")).not.toBe(matchKey("Jules Pike"));
  expect(matchKey("Pike")).not.toBe(matchKey("Rowan Pike"));
});

test("matchKey of blank input is empty", () => {
  expect(matchKey("   ")).toBe("");
});
