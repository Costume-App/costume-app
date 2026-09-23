// Client-safe types for measurement form import (no server imports; the review UI uses these too).

// What the AI returns: only what is written on the page, no mapping and no decisions.
export interface RawFormExtraction {
  name: string | null;
  casted_as: string | null;
  sex: string | null;
  age: string | null;
  contact: string | null;
  sizes: { shirt: string | null; pant: string | null; shoe: string | null };
  fields: { label: string; value: string }[]; // lettered lines and "Other Measurements", as written
  notes: string[]; // loose handwriting that is not a label and value pair
}

export interface DefinitionInfo {
  key: string;
  label: string;
  unit: string;
  input_type: string;
  display_order: number;
}

// Saved values keyed by measurement key: numbers for numeric definitions, strings for text ones.
export type MeasurementMap = Record<string, number | string>;

export interface ExistingPerformer {
  id: string;
  name: string;
  notes: string | null;
  measurements: MeasurementMap;
}

// The production as matching and the review's diff see it.
export interface ExistingData {
  performers: ExistingPerformer[];
  definitions: DefinitionInfo[];
}

export type PerformerTarget = { kind: "existing"; performerId: string } | { kind: "new"; name: string };

// One mapped field. Both values null means the label was recognized but the value was not readable.
export interface DraftField {
  key: string;
  label: string; // as written on the form
  raw: string; // as written on the form
  valueNumeric: number | null;
  valueText: string | null;
}

export interface FormDraft {
  id: string;
  fileName: string;
  name: string | null;
  castedAs: string | null;
  performer: PerformerTarget;
  candidateIds: string[]; // existing performers whose match key equals the read name
  fields: DraftField[]; // in definition display order
  notesToAppend: string; // "" when nothing is left over
}

export type FieldStatus = "new" | "changed" | "same" | "unreadable";

// What the review ticked for one draft, keyed by draft id in the panel.
export interface FormSelection {
  fields: Record<string, boolean>; // measurement key -> ticked
  notes: boolean;
}

export interface ApplyMeasurement {
  key: string;
  valueNumeric: number | null;
  valueText: string | null;
}

export interface ApplyForm {
  performer: PerformerTarget;
  measurements: ApplyMeasurement[];
  notesAppend: string | null;
}

export interface ApplyPayload {
  forms: ApplyForm[];
}

export interface ImportResult {
  performersCreated: number;
  measurementsWritten: number;
  notesAppended: number;
}
