import { expect, test } from "vitest";
import { normalizeLabel, resolveKey } from "@/lib/measurement-import/aliases";

test("normalizeLabel lowercases, drops the letter prefix, parentheticals and punctuation", () => {
  expect(normalizeLabel("A chest")).toBe("chest");
  expect(normalizeLabel('B waist (1" above navel)')).toBe("waist");
  expect(normalizeLabel("D inseam (crotch to above foot)")).toBe("inseam");
  expect(normalizeLabel("G shoulders across back")).toBe("shoulders across back");
  expect(normalizeLabel("Nape-W")).toBe("nape w");
  expect(normalizeLabel("Sh - W")).toBe("sh w");
  expect(normalizeLabel("  Head:  ")).toBe("head");
});

test("normalizeLabel keeps a word that merely starts with a letter a to g", () => {
  expect(normalizeLabel("Arm")).toBe("arm");
  expect(normalizeLabel("Bust")).toBe("bust");
});

test.each([
  ["A chest", "chest"],
  ["Bust", "chest"],
  ['B waist (1" above navel)', "waist"],
  ["C hip", "hips"],
  ["Hips", "hips"],
  ["D inseam (crotch to above foot)", "inseam"],
  ["E nape to floor", "nape_to_floor"],
  ["F height", "height"],
  ["G shoulders across back", "shoulder"],
  ["Shoulder width", "shoulder"],
  ["Head", "head"],
  ["Neck", "neck"],
  ["Nape-W", "back_length"],
  ["Nape to waist", "back_length"],
  ["Back length", "back_length"],
  ["Sh-W", "sleeve"],
  ["Shoulder to wrist", "sleeve"],
  ["Sleeve", "sleeve"],
  ["Weight", "weight"],
  ["Wrist", "wrist"],
  ["Thigh", "thigh"],
  ["Knee", "knee"],
  ["Bicep", "arm_circumference"],
  ["Arm", "arm_circumference"],
  ["Outseam", "outseam"],
  ["Shirt", "shirt_size"],
  ["Pants", "pant_size"],
  ["Shoe", "shoe_size"],
])("resolveKey(%s) is %s", (label, key) => {
  expect(resolveKey(label)).toBe(key);
});

test.each(["Hip-ankle", "Sh-E", "E-Wr", "Crystal - Vest", ""])("resolveKey(%s) is null", (label) => {
  expect(resolveKey(label)).toBeNull();
});
