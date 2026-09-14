export type RoleSortMode = "order" | "character" | "performer";

export const ROLE_SORT_OPTIONS: { id: RoleSortMode; label: string }[] = [
  { id: "order", label: "Order added" },
  { id: "character", label: "Character A–Z" },
  { id: "performer", label: "Performer A–Z" },
];

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Returns a sorted copy of `roles`. "performer" sorts by the selected cast's primary
// performer; roles with no primary performer go last, ordered by character name.
export function sortRoles<R extends { id: string; name: string }>(
  roles: R[],
  mode: RoleSortMode,
  ctx: {
    castings: { castId: string; roleId: string; performerId: string; assignment: string }[];
    performers: { id: string; name: string }[];
    selectedCastId: string;
  },
): R[] {
  if (mode === "character") {
    return [...roles].sort((a, b) => collator.compare(a.name, b.name));
  }
  if (mode === "performer") {
    const performerName = new Map(ctx.performers.map((p) => [p.id, p.name]));
    const primaryName = new Map<string, string>();
    for (const c of ctx.castings) {
      if (c.castId !== ctx.selectedCastId || c.assignment !== "primary") continue;
      const name = performerName.get(c.performerId);
      if (name) primaryName.set(c.roleId, name);
    }
    return [...roles].sort((a, b) => {
      const pa = primaryName.get(a.id);
      const pb = primaryName.get(b.id);
      if (pa && pb) return collator.compare(pa, pb) || collator.compare(a.name, b.name);
      if (pa) return -1;
      if (pb) return 1;
      return collator.compare(a.name, b.name);
    });
  }
  return roles;
}
