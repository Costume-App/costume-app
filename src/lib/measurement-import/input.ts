import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { ValidationError } from "@/lib/errors";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, UNSUPPORTED_FILE_MESSAGE } from "@/lib/measurement-import/limits";

export const CHOOSE_FILE = "Choose a photo of a measurement form.";

// One uploaded form photo (or a one-page PDF) as a Claude content block. Nothing is stored.
export async function toFormContent(file: File | null): Promise<Anthropic.ContentBlockParam> {
  if (!file || file.size === 0) throw new ValidationError(CHOOSE_FILE);
  if (file.size > MAX_FILE_BYTES) throw new ValidationError("Photos must be 4 MB or smaller.");
  const dot = file.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) throw new ValidationError(UNSUPPORTED_FILE_MESSAGE);
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  if (ext === ".pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  if (ext === ".png") return { type: "image", source: { type: "base64", media_type: "image/png", data } };
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
}
