import type { DraftField, FieldStatus } from "@/lib/measurement-import/types";

// How a form value relates to what the chosen performer already has saved.
export function fieldStatus(field: DraftField, saved: number | string | undefined): FieldStatus {
  if (field.valueNumeric === null && field.valueText === null) return "unreadable";
  if (saved === undefined) return "new";
  if (field.valueNumeric !== null) {
    return Number(saved) === field.valueNumeric ? "same" : "changed";
  }
  const savedText = String(saved).trim().toLowerCase();
  return savedText === (field.valueText ?? "").trim().toLowerCase() ? "same" : "changed";
}

// Overwrites are the point of the import; unchanged and unreadable values are never written.
export function preChecked(status: FieldStatus): boolean {
  return status === "new" || status === "changed";
}
