export type PerformerOrderMode = "role" | "alpha" | "added";

export const PERFORMER_ORDER_MODES: { value: PerformerOrderMode; label: string }[] = [
  { value: "role", label: "By role" },
  { value: "alpha", label: "A to Z" },
  { value: "added", label: "Order added" },
];

export interface SwitcherPerformer {
  id: string;
  label: string;
  createdAt: string;
  filled: number; // measurements recorded so far
}

// Order performers for the measurement switcher. `roleOrder` is performer ids as they
// appear down the Cast tab (roles in order); someone in several roles takes their first
// place, and anyone not cast yet follows in the order they were added.
export function orderPerformers(
  performers: SwitcherPerformer[],
  mode: PerformerOrderMode,
  roleOrder: string[],
): SwitcherPerformer[] {
  const added = [...performers].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (mode === "added") return added;
  if (mode === "alpha") {
    return [...performers].sort(
      (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.createdAt.localeCompare(b.createdAt),
    );
  }
  const rank = new Map<string, number>();
  roleOrder.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const cast = added.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...cast, ...added.filter((p) => !rank.has(p.id))];
}

// The performers Prev and Next go to. With skipComplete, fully measured performers are
// passed over (the current one is always the starting point, complete or not).
export function neighbors(
  ordered: SwitcherPerformer[],
  currentId: string,
  opts: { skipComplete: boolean; total: number },
): { prev: string | null; next: string | null } {
  const i = ordered.findIndex((p) => p.id === currentId);
  if (i === -1) return { prev: null, next: null };
  const eligible = (p: SwitcherPerformer) => !opts.skipComplete || p.filled < opts.total;
  const prev = ordered.slice(0, i).reverse().find(eligible) ?? null;
  const next = ordered.slice(i + 1).find(eligible) ?? null;
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}
