import type { MeasureStatus } from "@/components/ProductionWorkspace";

// Roll up per-performer measurement statuses into one role-level status:
// none (empty / nobody measured), complete (everyone done), else partial.
export function aggregateMeasureStatus(statuses: MeasureStatus[]): MeasureStatus {
  if (statuses.length === 0) return "none";
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.every((s) => s === "none")) return "none";
  return "partial";
}
