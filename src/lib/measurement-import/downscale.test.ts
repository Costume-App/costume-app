import { expect, test } from "vitest";
import { isImageFile } from "@/lib/measurement-import/downscale";

test("isImageFile trusts a non-empty MIME type", () => {
  expect(isImageFile({ type: "image/jpeg", name: "form" })).toBe(true);
  expect(isImageFile({ type: "application/pdf", name: "form.jpg" })).toBe(false);
});

test("isImageFile falls back to the extension when the type is empty", () => {
  expect(isImageFile({ type: "", name: "form.JPG" })).toBe(true);
  expect(isImageFile({ type: "", name: "form.jpeg" })).toBe(true);
  expect(isImageFile({ type: "", name: "form.png" })).toBe(true);
  expect(isImageFile({ type: "", name: "form.pdf" })).toBe(false);
  expect(isImageFile({ type: "", name: "form" })).toBe(false);
});
