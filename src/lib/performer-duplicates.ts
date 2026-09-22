// Client-safe (no server imports). Shared by the production page, the combine route, and the
// review panel so all three see the same groups and the same kept row.
import { matchKey } from "@/lib/cast-import/normalize";
import type { Assignment } from "@/lib/casting-assignment";

export interface DuplicateMember {
  performerId: string;
  name: string;
  filledMeasurements: number;
  castings: { castingId: string; castId: string; roleId: string; assignment: Assignment }[];
}

export interface DuplicateGroup {
  key: string;
  keepId: string;
  members: DuplicateMember[];
  blocked: { reason: "collision"; castId: string; roleId: string } | null;
}

export interface DuplicateInput {
  performers: { id: string; name: string }[];
  castings: { id: string; castId: string; roleId: string; performerId: string; assignment: Assignment }[];
  filledCounts: Record<string, number>;
}

// Kept row: most filled measurements, then the smallest id. No creation time on purpose: the
// client does not hold it for rows added this session, and both sides must rank identically.
function compareKeepPriority(a: DuplicateMember, b: DuplicateMember): number {
  if (b.filledMeasurements !== a.filledMeasurements) return b.filledMeasurements - a.filledMeasurements;
  return a.performerId < b.performerId ? -1 : a.performerId > b.performerId ? 1 : 0;
}

// Two members in the same cast and role cannot be merged: castings are unique per
// (cast, role, performer), so moving one onto the other would violate that key.
function findCollision(members: DuplicateMember[]): DuplicateGroup["blocked"] {
  const seen = new Set<string>();
  for (const m of members) {
    for (const c of m.castings) {
      const slot = `${c.castId}:${c.roleId}`;
      if (seen.has(slot)) return { reason: "collision", castId: c.castId, roleId: c.roleId };
      seen.add(slot);
    }
  }
  return null;
}

export function findDuplicateGroups(input: DuplicateInput): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateMember[]>();
  for (const p of input.performers) {
    const key = matchKey(p.name);
    if (!key) continue;
    const member: DuplicateMember = {
      performerId: p.id,
      name: p.name,
      filledMeasurements: input.filledCounts[p.id] ?? 0,
      castings: input.castings
        .filter((c) => c.performerId === p.id)
        .map((c) => ({ castingId: c.id, castId: c.castId, roleId: c.roleId, assignment: c.assignment })),
    };
    const list = byKey.get(key) ?? [];
    list.push(member);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const ordered = [...members].sort(compareKeepPriority);
    groups.push({ key, keepId: ordered[0].performerId, members: ordered, blocked: findCollision(ordered) });
  }
  groups.sort((a, b) => a.members[0].name.localeCompare(b.members[0].name, undefined, { sensitivity: "base" }));
  return groups;
}
