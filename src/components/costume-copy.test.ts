import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Costume Creations and House Inventory copy is filmed in training videos 4
// and 5; the owner's rule is no em-dashes in published copy. The bare
// "no value" cell glyph is exempt.
const FILES = [
  "src/components/AddToInventoryControl.tsx",
  "src/components/MakePieceRow.tsx",
  "src/components/InventoryManager.tsx",
  "src/components/InventoryQuickAddCard.tsx",
];

test.each(FILES)("%s has no em-dash in prose", (file) => {
  const offenders = readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter(({ text }) => text.includes("\u2014") && !/>\u2014</.test(text));
  expect(offenders).toEqual([]);
});
