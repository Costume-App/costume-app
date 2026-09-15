interface Named { id: string; name: string }
interface CastingLike { id: string; castId: string; roleId: string; performerId: string }

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// "Tevye (Cast A), Villagers (Cast B)" per performer — shown in the picker so same-named
// performers can be told apart. Cast names are dropped when there's only one cast.
export function performerRoleSummaries(
  performers: Named[],
  castings: CastingLike[],
  roles: Named[],
  casts: Named[],
): Record<string, string> {
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));
  const showCast = casts.length > 1;
  const labels: Record<string, string[]> = {};
  for (const c of castings) {
    const rn = roleName.get(c.roleId);
    if (!rn) continue;
    (labels[c.performerId] ??= []).push(showCast ? `${rn} (${castName.get(c.castId) ?? "—"})` : rn);
  }
  return Object.fromEntries(performers.map((p) => [p.id, (labels[p.id] ?? []).join(", ")]));
}

// Existing performers who could be added to `target` (a role in a cast), filtered by name.
export function pickerCandidates<P extends Named>(
  query: string,
  performers: P[],
  castings: Omit<CastingLike, "id">[],
  target: { castId: string; roleId: string },
): P[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(
    castings.filter((c) => c.castId === target.castId && c.roleId === target.roleId).map((c) => c.performerId),
  );
  return performers
    .filter((p) => !taken.has(p.id) && p.name.toLowerCase().includes(q))
    .sort((a, b) => collator.compare(a.name, b.name));
}

// True when removing `castingId` leaves the performer with no castings (they'll be deleted).
export function isLastCasting(
  performerId: string,
  castingId: string,
  castings: Pick<CastingLike, "id" | "performerId">[],
): boolean {
  return !castings.some((c) => c.performerId === performerId && c.id !== castingId);
}
