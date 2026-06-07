import type { MeasureStatus } from "@/components/ProductionWorkspace";

// Small status circle: empty ring (none), left-half filled (partial), full (complete).
export function MeasurementDot({ status }: { status: MeasureStatus }) {
  const label =
    status === "complete"
      ? "Measurements complete"
      : status === "partial"
        ? "Measurements in progress"
        : "No measurements yet";
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <circle cx="6" cy="6" r="5" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      {status === "partial" && <path d="M6 1 A5 5 0 0 0 6 11 Z" fill="var(--red)" />}
      {status === "complete" && <circle cx="6" cy="6" r="5" fill="var(--red)" stroke="var(--red)" strokeWidth="1.5" />}
    </svg>
  );
}
