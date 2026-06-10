export type MakeStatus = "done" | "outstanding" | "unassigned";

// done = made; outstanding = assigned to a maker but not yet made; unassigned
// otherwise. Mapped to green / red / neutral in the UI.
export function makeStatus(made: boolean, makerId: string | null): MakeStatus {
  if (made) return "done";
  if (makerId) return "outstanding";
  return "unassigned";
}
