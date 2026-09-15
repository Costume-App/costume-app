import type { ImportCounts } from "@/lib/cast-import/types";

// "26 new roles, 23 new performers and 81 castings" — for the Import button and the success note.
export function describeCounts(counts: ImportCounts): string {
  const parts = [
    plural(counts.casts, "new cast"),
    plural(counts.roles, "new role"),
    plural(counts.performers, "new performer"),
    plural(counts.castings, "casting"),
  ].filter(Boolean);
  if (parts.length === 0) return "nothing new";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function plural(n: number, noun: string): string {
  return n === 0 ? "" : `${n} ${noun}${n === 1 ? "" : "s"}`;
}
