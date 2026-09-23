import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ValidationError } from "@/lib/errors";
import { toFormContent } from "@/lib/measurement-import/input";

const file = (name: string, bytes: Uint8Array, type = "") => new File([bytes as BlobPart], name, { type });

test("a JPG becomes a base64 image block", async () => {
  const block = await toFormContent(file("form.JPG", new Uint8Array([1, 2, 3])));
  expect(block).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AQID" } });
});

test("a PNG becomes an image block and a PDF a document block", async () => {
  expect(await toFormContent(file("f.png", new Uint8Array([1])))).toMatchObject({ type: "image", source: { media_type: "image/png" } });
  expect(await toFormContent(file("f.pdf", new Uint8Array([1])))).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
});

test("rejects a missing file, an empty file, an unsupported type and an oversized file", async () => {
  await expect(toFormContent(null)).rejects.toBeInstanceOf(ValidationError);
  await expect(toFormContent(file("f.jpg", new Uint8Array([])))).rejects.toBeInstanceOf(ValidationError);
  await expect(toFormContent(file("f.docx", new Uint8Array([1])))).rejects.toBeInstanceOf(ValidationError);
  await expect(toFormContent(file("f.jpg", new Uint8Array(4 * 1024 * 1024 + 1)))).rejects.toBeInstanceOf(ValidationError);
});
