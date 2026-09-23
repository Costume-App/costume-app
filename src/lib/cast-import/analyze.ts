import type { ApplyPayload, ExistingData, ImportCasting, ImportCounts } from "@/lib/cast-import/types";
import { cleanName } from "@/lib/cast-import/normalize";

// Mirrors MAX_PERFORMER_NAME in src/lib/data/performers.ts (that module is server-only).
export const MAX_PERFORMER_NAME_LENGTH = 100;

export type ConflictKind =
  | "existing_primary"
  | "duplicate_primary"
  | "role_type_mismatch"
  | "invalid_name"
  | "unknown_reference";

export interface Conflict {
  kind: ConflictKind;
  message: string;
  castingKeys: string[];
  roleKey?: string;
}

export interface ImportAnalysis {
  alreadyCast: Set<string>; // casting keys that already exist in the production (skipped)
  duplicates: Set<string>; // casting keys repeating an earlier casting in this import (skipped)
  conflicts: Conflict[]; // must be empty to import
  counts: ImportCounts; // what the import would create
}

export const STALE_IMPORT_MESSAGE =
  "Something in this import is no longer in the production. Reload to see the latest.";

interface RoleInfo {
  identity: string;
  isEnsemble: boolean;
  name: string;
}

// Everything the review screen and the apply route need to know about an import. Castings are
// compared by resolved identity (existing id, or the new item's key), so two keys the user pointed
// at the same existing role or person are treated as the same thing.
export function analyzeImport(payload: ApplyPayload, existing: ExistingData): ImportAnalysis {
  const conflicts: Conflict[] = [];
  let stale = false;
  const referencedCasts = new Set(payload.castings.map((c) => c.castKey));
  const referencedPerformers = new Set(payload.castings.map((c) => c.performerKey));

  const castIds = new Set(existing.casts.map((c) => c.id));
  const castIdentity = new Map<string, string>();
  for (const { key, target } of payload.casts) {
    if (target.kind === "existing") {
      if (castIds.has(target.castId)) castIdentity.set(key, `cast:${target.castId}`);
      else if (referencedCasts.has(key)) stale = true;
    } else {
      if (referencedCasts.has(key) && !cleanName(target.name)) {
        conflicts.push({ kind: "invalid_name", message: "Every new cast needs a name.", castingKeys: [] });
      }
      castIdentity.set(key, `new-cast:${key}`);
    }
  }

  const rolesById = new Map(existing.roles.map((r) => [r.id, r]));
  const roleInfo = new Map<string, RoleInfo>();
  for (const { key, target } of payload.roles) {
    if (target.kind === "existing") {
      const role = rolesById.get(target.roleId);
      if (role) roleInfo.set(key, { identity: `role:${role.id}`, isEnsemble: role.isEnsemble, name: role.name });
      else stale = true;
    } else {
      const name = cleanName(target.name);
      if (!name) {
        conflicts.push({ kind: "invalid_name", message: "Every new role needs a name.", castingKeys: [], roleKey: key });
      }
      roleInfo.set(key, { identity: `new-role:${key}`, isEnsemble: target.isEnsemble, name: name || "This role" });
    }
  }

  const performerIds = new Set(existing.performers.map((p) => p.id));
  const performerIdentity = new Map<string, string>();
  for (const { key, target } of payload.performers) {
    if (!referencedPerformers.has(key)) continue;
    if (target.kind === "existing") {
      if (performerIds.has(target.performerId)) performerIdentity.set(key, `performer:${target.performerId}`);
      else stale = true;
    } else {
      const name = cleanName(target.name);
      if (!name || name.length > MAX_PERFORMER_NAME_LENGTH) {
        conflicts.push({
          kind: "invalid_name",
          message: name
            ? `Performer names must be ${MAX_PERFORMER_NAME_LENGTH} characters or fewer.`
            : "Every performer needs a name.",
          castingKeys: payload.castings.filter((c) => c.performerKey === key).map((c) => c.key),
        });
      }
      performerIdentity.set(key, `new-performer:${key}`);
    }
  }

  const existingTriples = new Set(
    existing.castings.map((c) => `cast:${c.castId}|role:${c.roleId}|performer:${c.performerId}`),
  );
  const existingPrimary = new Map(
    existing.castings
      .filter((c) => c.assignment === "primary")
      .map((c) => [`cast:${c.castId}|role:${c.roleId}`, `performer:${c.performerId}`]),
  );
  const alreadyCast = new Set<string>();
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  const counted: ImportCasting[] = [];
  const mismatched = new Map<string, string[]>();
  const primaries = new Map<string, { roleKey: string; keys: string[] }>();

  for (const c of payload.castings) {
    const cast = castIdentity.get(c.castKey);
    const role = roleInfo.get(c.roleKey);
    const performer = performerIdentity.get(c.performerKey);
    if (!cast || !role || !performer) {
      stale = true;
      continue;
    }
    const triple = `${cast}|${role.identity}|${performer}`;
    if (existingTriples.has(triple)) {
      alreadyCast.add(c.key);
      continue;
    }
    if (seen.has(triple)) {
      duplicates.add(c.key);
      continue;
    }
    seen.add(triple);
    counted.push(c);

    if ((c.assignment === "ensemble") !== role.isEnsemble) {
      mismatched.set(c.roleKey, [...(mismatched.get(c.roleKey) ?? []), c.key]);
    } else if (c.assignment === "primary") {
      const slot = `${cast}|${role.identity}`;
      const current = existingPrimary.get(slot);
      if (current && current !== performer) {
        conflicts.push({
          kind: "existing_primary",
          message: `${role.name} already has a primary in this cast. Make this person an understudy or remove them.`,
          castingKeys: [c.key],
          roleKey: c.roleKey,
        });
      }
      const entry = primaries.get(slot) ?? { roleKey: c.roleKey, keys: [] };
      entry.keys.push(c.key);
      primaries.set(slot, entry);
    }
  }

  for (const [roleKey, keys] of mismatched) {
    const role = roleInfo.get(roleKey)!;
    conflicts.push({
      kind: "role_type_mismatch",
      message: role.isEnsemble
        ? `${role.name} is an ensemble role, so no one in it can be primary or understudy.`
        : `${role.name} isn't an ensemble role, so each person needs to be primary or understudy.`,
      castingKeys: keys,
      roleKey,
    });
  }
  for (const { roleKey, keys } of primaries.values()) {
    if (keys.length > 1) {
      conflicts.push({
        kind: "duplicate_primary",
        message: `Only one person can be primary for ${roleInfo.get(roleKey)!.name} in each cast — pick one.`,
        castingKeys: keys,
        roleKey,
      });
    }
  }
  if (stale) conflicts.push({ kind: "unknown_reference", message: STALE_IMPORT_MESSAGE, castingKeys: [] });

  const countedCasts = new Set(counted.map((c) => c.castKey));
  const countedPerformers = new Set(counted.map((c) => c.performerKey));
  return {
    alreadyCast,
    duplicates,
    conflicts,
    counts: {
      casts: payload.casts.filter((c) => c.target.kind === "new" && countedCasts.has(c.key)).length,
      roles: payload.roles.filter((r) => r.target.kind === "new").length,
      performers: payload.performers.filter((p) => p.target.kind === "new" && countedPerformers.has(p.key)).length,
      castings: counted.length,
    },
  };
}
