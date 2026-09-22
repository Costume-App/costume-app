// Client-safe (no server imports). Shared by the production page, the combine route, and the
// review panel so all three see the same groups and the same kept row.
import { matchKey } from "@/lib/cast-import/normalize";
import type { Assignment } from "@/lib/casting-assignment";
import { ValidationError } from "@/lib/errors";

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

export const MAX_COMBINE_GROUPS = 200;
export const CAST_LIST_CHANGED = "The cast list changed. Reload and review again.";
export const COMBINE_COLLISION = "Same person is cast twice in one role. Remove one casting first.";

export interface CombineRequestGroup {
  performerIds: string[];
}

export interface CombineCounts {
  groups: number;
  castingsMoved: number;
  measurementsFilled: number;
  performersRemoved: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID = "Invalid request. Reload and try again.";

// Shape-check an untrusted body. Whether the ids form a real group is matchRequestedGroups' job.
export function parseCombineBody(body: unknown): CombineRequestGroup[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ValidationError(INVALID);
  const groups = (body as { groups?: unknown }).groups;
  if (!Array.isArray(groups) || groups.length === 0) throw new ValidationError(INVALID);
  if (groups.length > MAX_COMBINE_GROUPS) {
    throw new ValidationError(`Combine at most ${MAX_COMBINE_GROUPS} names at a time.`);
  }
  return groups.map((raw): CombineRequestGroup => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError(INVALID);
    const ids = (raw as { performerIds?: unknown }).performerIds;
    if (!Array.isArray(ids) || ids.length < 2) throw new ValidationError(INVALID);
    const performerIds = ids.map((id) => {
      if (typeof id !== "string" || !UUID.test(id)) throw new ValidationError(INVALID);
      return id;
    });
    if (new Set(performerIds).size !== performerIds.length) throw new ValidationError(INVALID);
    return { performerIds };
  });
}

function setKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

// Every requested id set must be exactly one computed, unblocked group, and no group twice.
// Returns the computed groups in request order, or null when anything does not line up.
export function matchRequestedGroups(
  requested: CombineRequestGroup[],
  computed: DuplicateGroup[],
): DuplicateGroup[] | null {
  const byMembers = new Map(computed.map((g) => [setKey(g.members.map((m) => m.performerId)), g]));
  const used = new Set<string>();
  const matched: DuplicateGroup[] = [];
  for (const r of requested) {
    const key = setKey(r.performerIds);
    const g = byMembers.get(key);
    if (!g || g.blocked || used.has(key)) return null;
    used.add(key);
    matched.push(g);
  }
  return matched;
}

// What the review panel submits: the selected, unblocked groups, each as its full member set.
export function toCombineRequest(groups: DuplicateGroup[], selectedKeys: ReadonlySet<string>): CombineRequestGroup[] {
  return groups
    .filter((g) => selectedKeys.has(g.key) && !g.blocked)
    .map((g) => ({ performerIds: g.members.map((m) => m.performerId) }));
}

export function describeCombineCounts(counts: CombineCounts): string {
  const names = counts.groups === 1 ? "1 name" : `${counts.groups} names`;
  const filled = counts.measurementsFilled === 1 ? "1 measurement" : `${counts.measurementsFilled} measurements`;
  return `Combined ${names}; ${filled} carried over.`;
}
