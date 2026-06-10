import { expect, test } from "vitest";
import { normalizeTitle, findCuratedMatch, PLAY_CATALOG } from "@/lib/data/play-catalog";

test("normalizeTitle lowercases, trims, strips a leading article and punctuation", () => {
  expect(normalizeTitle("  The Nutcracker! ")).toBe("nutcracker");
  expect(normalizeTitle("A Midsummer Night's Dream")).toBe("midsummer nights dream");
  expect(normalizeTitle("Hamlet")).toBe("hamlet");
});

test("findCuratedMatch matches by canonical title, ignoring case/article/punctuation", () => {
  const match = findCuratedMatch("the hamlet");
  expect(match?.id).toBe("hamlet");
  expect(match?.roles.length).toBeGreaterThan(0);
});

test("findCuratedMatch matches by alias", () => {
  // "The Nutcracker" canonical; alias "nutcracker ballet" should also hit.
  const match = findCuratedMatch("Nutcracker Ballet");
  expect(match?.id).toBe("nutcracker");
});

test("findCuratedMatch returns null for an unknown title", () => {
  expect(findCuratedMatch("Some Original Devised Piece 2026")).toBeNull();
});

test("findCuratedMatch returns null for an empty title", () => {
  expect(findCuratedMatch("   ")).toBeNull();
});

test("every catalog entry has a unique id and non-empty roles", () => {
  const ids = PLAY_CATALOG.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const e of PLAY_CATALOG) expect(e.roles.length).toBeGreaterThan(0);
});
