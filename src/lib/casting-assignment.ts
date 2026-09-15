// Client-safe casting assignment values (no server imports — used by components too).
export const ASSIGNMENTS = ["primary", "understudy", "ensemble"] as const;
export type Assignment = (typeof ASSIGNMENTS)[number];

export function isAssignment(v: unknown): v is Assignment {
  return typeof v === "string" && (ASSIGNMENTS as readonly string[]).includes(v);
}

// Compact suffix for summary rows, e.g. "Cast A · u/s".
export function assignmentShortTag(a: Assignment): string {
  if (a === "understudy") return " · u/s";
  if (a === "ensemble") return " · ens";
  return "";
}
