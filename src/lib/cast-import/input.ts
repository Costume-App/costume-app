import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { ValidationError } from "@/lib/errors";
import { MAX_FILE_BYTES, MAX_TEXT_CHARS } from "@/lib/cast-import/limits";

type Block = Anthropic.ContentBlockParam;

const UNREADABLE = "Couldn't read that file — try pasting the text instead.";

// Turn a pasted list or an uploaded file into Claude content blocks. PDFs and images go to Claude
// natively (it reads the layout, which plain PDF text extraction scrambles); Word and Excel are
// converted to text that keeps cells apart. Nothing is stored.
export async function toCastListContent(input: { text: string | null; file: File | null }): Promise<Block[]> {
  if (input.file && input.file.size > 0) return fileToContent(input.file);
  const text = (input.text ?? "").trim();
  if (!text) throw new ValidationError("Paste a cast list or choose a file.");
  return [textBlock(text)];
}

function textBlock(text: string): Block {
  if (text.length > MAX_TEXT_CHARS) {
    throw new ValidationError(
      `That's too much text — cast lists can be up to ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters.`,
    );
  }
  return { type: "text", text };
}

async function fileToContent(file: File): Promise<Block[]> {
  if (file.size > MAX_FILE_BYTES) throw new ValidationError("Files must be 4 MB or smaller.");
  const dot = file.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case ".txt":
    case ".csv":
      return [textBlock(nonEmpty(bytes.toString("utf8")))];
    case ".pdf":
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }];
    case ".png":
      return [{ type: "image", source: { type: "base64", media_type: "image/png", data: bytes.toString("base64") } }];
    case ".jpg":
    case ".jpeg":
      return [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: bytes.toString("base64") } }];
    case ".docx":
      return [textBlock(nonEmpty(await readDocx(bytes)))];
    case ".xlsx":
      return [textBlock(nonEmpty(await readXlsx(bytes)))];
    default:
      throw new ValidationError("Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text, PNG or JPG file.");
  }
}

function nonEmpty(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new ValidationError("That file is empty.");
  return trimmed;
}

async function readDocx(bytes: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: bytes });
    return value;
  } catch {
    throw new ValidationError(UNREADABLE);
  }
}

async function readXlsx(bytes: Buffer): Promise<string> {
  let sheets: Awaited<ReturnType<typeof readExcelFile>>;
  try {
    sheets = await readExcelFile(bytes);
  } catch {
    throw new ValidationError(UNREADABLE);
  }
  return sheets
    .map(({ sheet, data }) => [`Sheet: ${sheet}`, ...data.map((row) => row.map(cellText).join("\t"))].join("\n"))
    .join("\n\n");
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  const value = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell);
  return value.replace(/\s*\n\s*/g, "; ");
}
