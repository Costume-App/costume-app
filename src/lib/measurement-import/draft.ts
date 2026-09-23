import { cleanName, matchKey } from "@/lib/cast-import/normalize";
import { resolveKey } from "@/lib/measurement-import/aliases";
import type { DraftField, ExistingData, FormDraft, PerformerTarget, RawFormExtraction } from "@/lib/measurement-import/types";
import { parseHeight, parseInches, parseTextValue, parseWeight } from "@/lib/measurement-import/values";

interface Line {
  label: string;
  value: string;
}

// The three size boxes are printed labels; treat them like any other line.
function sizeLines(sizes: RawFormExtraction["sizes"]): Line[] {
  const lines: Line[] = [];
  if (sizes.shirt) lines.push({ label: "Shirt", value: sizes.shirt });
  if (sizes.pant) lines.push({ label: "Pant", value: sizes.pant });
  if (sizes.shoe) lines.push({ label: "Shoe", value: sizes.shoe });
  return lines;
}

function parseByKey(key: string, inputType: string, raw: string): Pick<DraftField, "valueNumeric" | "valueText"> {
  if (inputType === "text") return { valueNumeric: null, valueText: parseTextValue(raw) };
  if (key === "height") return { valueNumeric: parseHeight(raw), valueText: null };
  if (key === "weight") return { valueNumeric: parseWeight(raw), valueText: null };
  return { valueNumeric: parseInches(raw), valueText: null };
}

// The calendar day in the viewer's own time zone. The server runs in UTC, so an evening import in
// the Americas would otherwise stamp tomorrow's date on the notes block.
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The notes-block date the browser sent, or the server's UTC day when it sent nothing usable.
export function formDate(value: unknown, now: Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return now.toISOString().slice(0, 10);
}

// Everything the app has no field for, as lines for the performer's notes. Empty when nothing is
// left over, so the review shows no notes block at all.
export function buildNotesBlock(extraction: RawFormExtraction, unmapped: Line[], today: string): string {
  const lines: string[] = [];
  for (const line of unmapped) lines.push(`${line.label.trim()}: ${line.value.trim()}`);
  if (extraction.sex?.trim()) lines.push(`Sex: ${extraction.sex.trim()}`);
  if (extraction.age?.trim()) lines.push(`Age: ${extraction.age.trim()}`);
  if (extraction.contact?.trim()) lines.push(`Contact: ${extraction.contact.trim()}`);
  for (const note of extraction.notes) if (note.trim()) lines.push(note.trim());
  if (lines.length === 0) return "";
  return [`From measurement form, ${today}:`, ...lines].join("\n");
}

function matchPerformer(name: string | null, existing: ExistingData): { target: PerformerTarget; candidateIds: string[] } {
  const cleaned = name ? cleanName(name) : "";
  if (!cleaned) return { target: { kind: "new", name: "" }, candidateIds: [] };
  const key = matchKey(cleaned);
  const candidateIds = existing.performers.filter((p) => matchKey(p.name) === key).map((p) => p.id);
  return {
    target: candidateIds.length === 1 ? { kind: "existing", performerId: candidateIds[0] } : { kind: "new", name: cleaned },
    candidateIds,
  };
}

// Turn one extraction into a reviewable draft. Fields come out in definition order, one per key
// (first occurrence wins); lines with no alias go to the notes block.
export function buildDraft(
  extraction: RawFormExtraction,
  existing: ExistingData,
  meta: { id: string; fileName: string; today: string },
): FormDraft {
  const byKey = new Map<string, Line>();
  const unmapped: Line[] = [];
  for (const line of [...extraction.fields, ...sizeLines(extraction.sizes)]) {
    if (!line.label.trim() && !line.value.trim()) continue;
    const key = resolveKey(line.label);
    if (key === null) {
      unmapped.push(line);
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, line);
  }

  const fields: DraftField[] = [];
  for (const def of [...existing.definitions].sort((a, b) => a.display_order - b.display_order)) {
    const line = byKey.get(def.key);
    if (!line) continue;
    fields.push({ key: def.key, label: line.label, raw: line.value, ...parseByKey(def.key, def.input_type, line.value) });
  }

  const name = extraction.name?.trim() ? cleanName(extraction.name) : null;
  const { target, candidateIds } = matchPerformer(name, existing);
  return {
    id: meta.id,
    fileName: meta.fileName,
    name,
    castedAs: extraction.casted_as?.trim() ? cleanName(extraction.casted_as) : null,
    performer: target,
    candidateIds,
    fields,
    notesToAppend: buildNotesBlock(extraction, unmapped, meta.today),
  };
}
