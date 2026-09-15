import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
const convertToHtml = vi.fn();
vi.mock("mammoth", () => ({ default: { convertToHtml: (...a: unknown[]) => convertToHtml(...a) } }));
const readExcelFile = vi.fn();
vi.mock("read-excel-file/node", () => ({ default: (...a: unknown[]) => readExcelFile(...a) }));

import { toCastListContent } from "@/lib/cast-import/input";

beforeEach(() => {
  convertToHtml.mockReset();
  readExcelFile.mockReset();
});

const file = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name);

test("pasted text becomes a trimmed text block", async () => {
  expect(await toCastListContent({ text: "  Alf\tAda Finch \n", file: null })).toEqual([
    { type: "text", text: "Alf\tAda Finch" },
  ]);
});

test("nothing pasted and no file is a validation error", async () => {
  await expect(toCastListContent({ text: "   ", file: null })).rejects.toThrow("Paste a cast list or choose a file.");
});

test("over-long text is rejected, never truncated", async () => {
  await expect(toCastListContent({ text: "x".repeat(50_001), file: null })).rejects.toThrow(ValidationError);
});

test("a file wins over pasted text; .txt and .csv are read as text", async () => {
  expect(await toCastListContent({ text: "ignored", file: file("list.CSV", "Alf,Ada Finch") })).toEqual([
    { type: "text", text: "Alf,Ada Finch" },
  ]);
  await expect(toCastListContent({ text: null, file: file("empty.txt", "  ") })).rejects.toThrow("That file is empty.");
});

test("PDFs become base64 document blocks; PNG/JPG become image blocks", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const b64 = Buffer.from(bytes).toString("base64");
  expect(await toCastListContent({ text: null, file: file("cast.pdf", bytes) })).toEqual([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
  ]);
  expect(await toCastListContent({ text: null, file: file("board.jpeg", bytes) })).toEqual([
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
  ]);
  expect(await toCastListContent({ text: null, file: file("board.png", bytes) })).toEqual([
    { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
  ]);
});

test(".docx is converted to HTML so table cells stay separate", async () => {
  convertToHtml.mockResolvedValue({ value: "<table><tr><td><p>Alf</p></td><td><p>Ada Finch</p></td></tr></table>" });
  expect(await toCastListContent({ text: null, file: file("cast.docx", "zip") })).toEqual([
    { type: "text", text: "<table><tr><td><p>Alf</p></td><td><p>Ada Finch</p></td></tr></table>" },
  ]);
  expect(convertToHtml).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
});

test(".xlsx sheets become tab-separated text; line breaks inside a cell become semicolons", async () => {
  readExcelFile.mockResolvedValue([
    { sheet: "Cast", data: [["Character", "Actor"], ["Pirates", "Bo One\nCy Two"], ["Alf", null]] },
  ]);
  expect(await toCastListContent({ text: null, file: file("cast.xlsx", "zip") })).toEqual([
    { type: "text", text: "Sheet: Cast\nCharacter\tActor\nPirates\tBo One; Cy Two\nAlf" }, // outer trim drops the empty last cell's tab
  ]);
});

test("unreadable Word/Excel files get a paste-instead message", async () => {
  convertToHtml.mockRejectedValue(new Error("Can't find end of central directory"));
  await expect(toCastListContent({ text: null, file: file("bad.docx", "x") })).rejects.toThrow(
    "Couldn't read that file — try pasting the text instead.",
  );
  readExcelFile.mockRejectedValue(new Error("Doesn't look like an .xlsx file"));
  await expect(toCastListContent({ text: null, file: file("bad.xlsx", "x") })).rejects.toThrow(
    "Couldn't read that file — try pasting the text instead.",
  );
});

test("unsupported types and files over 4 MB are rejected", async () => {
  await expect(toCastListContent({ text: null, file: file("cast.pages", "x") })).rejects.toThrow(
    "Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text, PNG or JPG file.",
  );
  const big = file("big.pdf", new Uint8Array(4 * 1024 * 1024 + 1));
  await expect(toCastListContent({ text: null, file: big })).rejects.toThrow("Files must be 4 MB or smaller.");
});
