import { cleanName } from "@/lib/cast-import/normalize";
import { ValidationError } from "@/lib/errors";
import { MAX_FORMS, MAX_NEW_PERFORMER_NAME, MAX_NOTES_APPEND, MAX_TEXT_VALUE } from "@/lib/measurement-import/limits";
import type {
  ApplyForm,
  ApplyMeasurement,
  ApplyPayload,
  FormDraft,
  FormSelection,
  PerformerTarget,
} from "@/lib/measurement-import/types";

export const STALE_IMPORT_MESSAGE = "The cast changed while you were importing. Reload to see the latest.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// What the review ticked, as the apply route accepts it. Drafts with nothing ticked are dropped.
export function toApplyPayload(drafts: FormDraft[], selections: Record<string, FormSelection>): ApplyPayload {
  const forms: ApplyForm[] = [];
  for (const draft of drafts) {
    const selection = selections[draft.id] ?? { fields: {}, notes: false };
    const measurements: ApplyMeasurement[] = draft.fields
      .filter((f) => selection.fields[f.key] && (f.valueNumeric !== null || f.valueText !== null))
      .map((f) => ({ key: f.key, valueNumeric: f.valueNumeric, valueText: f.valueText }));
    const notesAppend = selection.notes && draft.notesToAppend ? draft.notesToAppend : null;
    if (measurements.length === 0 && notesAppend === null) continue;
    forms.push({ performer: draft.performer, measurements, notesAppend });
  }
  return { forms };
}

function bad(message: string): never {
  throw new ValidationError(message);
}

function parseTarget(value: unknown): PerformerTarget {
  if (typeof value !== "object" || value === null) bad("Each form needs a performer.");
  const t = value as Record<string, unknown>;
  if (t.kind === "existing") {
    if (typeof t.performerId !== "string" || !UUID.test(t.performerId)) bad("Each form needs a performer.");
    return { kind: "existing", performerId: t.performerId };
  }
  if (t.kind === "new") {
    const name = typeof t.name === "string" ? cleanName(t.name) : "";
    if (!name) bad("Each form needs a performer name.");
    if (name.length > MAX_NEW_PERFORMER_NAME) bad(`Performer names must be ${MAX_NEW_PERFORMER_NAME} characters or fewer.`);
    return { kind: "new", name };
  }
  return bad("Each form needs a performer.");
}

function parseMeasurement(value: unknown, knownKeys: ReadonlySet<string>): ApplyMeasurement {
  if (typeof value !== "object" || value === null) bad("Invalid measurement.");
  const m = value as Record<string, unknown>;
  if (typeof m.key !== "string" || !knownKeys.has(m.key)) bad("Unknown measurement field.");
  const valueNumeric = m.valueNumeric == null ? null : m.valueNumeric;
  const valueText = m.valueText == null ? null : m.valueText;
  if (valueNumeric !== null) {
    if (typeof valueNumeric !== "number" || !Number.isFinite(valueNumeric) || valueNumeric <= 0) {
      bad("Measurements must be numbers greater than zero.");
    }
    return { key: m.key, valueNumeric, valueText: null };
  }
  if (typeof valueText !== "string" || !valueText.trim()) bad("Measurement value is required.");
  if (valueText.trim().length > MAX_TEXT_VALUE) bad(`Sizes must be ${MAX_TEXT_VALUE} characters or fewer.`);
  return { key: m.key, valueNumeric: null, valueText: valueText.trim() };
}

// Validate a request body into an ApplyPayload. Throws ValidationError (HTTP 400) on any problem.
export function parseApplyPayload(body: unknown, knownKeys: ReadonlySet<string>): ApplyPayload {
  if (typeof body !== "object" || body === null) bad("Invalid import.");
  const formsRaw = (body as Record<string, unknown>).forms;
  if (!Array.isArray(formsRaw)) bad("Invalid import.");
  if (formsRaw.length === 0) bad("Import at least one form.");
  if (formsRaw.length > MAX_FORMS) bad(`Import up to ${MAX_FORMS} forms at a time.`);
  const forms: ApplyForm[] = [];
  for (const raw of formsRaw) {
    if (typeof raw !== "object" || raw === null) bad("Invalid import.");
    const f = raw as Record<string, unknown>;
    const performer = parseTarget(f.performer);
    const measurements = (Array.isArray(f.measurements) ? f.measurements : []).map((m) => parseMeasurement(m, knownKeys));
    const keys = new Set(measurements.map((m) => m.key));
    if (keys.size !== measurements.length) bad("A form lists the same field twice.");
    let notesAppend: string | null = null;
    if (f.notesAppend != null) {
      if (typeof f.notesAppend !== "string") bad("Invalid notes.");
      notesAppend = f.notesAppend.trim() || null;
      if (notesAppend && notesAppend.length > MAX_NOTES_APPEND) bad(`Notes must be ${MAX_NOTES_APPEND} characters or fewer.`);
    }
    if (measurements.length === 0 && notesAppend === null) bad("Nothing ticked to import for one of the forms.");
    forms.push({ performer, measurements, notesAppend });
  }
  return { forms };
}
