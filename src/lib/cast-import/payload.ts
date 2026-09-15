import { ValidationError } from "@/lib/errors";
import { isAssignment } from "@/lib/casting-assignment";
import type {
  ApplyPayload,
  CastTarget,
  Draft,
  ImportCasting,
  PerformerTarget,
  RoleTarget,
} from "@/lib/cast-import/types";

export const IMPORT_LIMITS = { casts: 20, roles: 200, performers: 500, castings: 500 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The review's draft → what the apply endpoint takes. Casts and performers no casting uses any
// more (the user removed those rows) are dropped so they're never created.
export function toApplyPayload(draft: Draft): ApplyPayload {
  const castKeys = new Set(draft.castings.map((c) => c.castKey));
  const performerKeys = new Set(draft.castings.map((c) => c.performerKey));
  return {
    casts: draft.casts.filter((c) => castKeys.has(c.key)).map(({ key, target }) => ({ key, target })),
    roles: draft.roles.map(({ key, target }) => ({ key, target })),
    performers: draft.performers
      .filter((p) => performerKeys.has(p.key))
      .map(({ key, target }) => ({ key, target })),
    castings: draft.castings.map(({ key, castKey, roleKey, performerKey, assignment }) => ({
      key,
      castKey,
      roleKey,
      performerKey,
      assignment,
    })),
  };
}

function fail(): never {
  throw new ValidationError("Invalid import. Reload and try again.");
}

function asObject(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail();
  return v as Record<string, unknown>;
}

function asArray(v: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(v)) fail();
  if (v.length > max) throw new ValidationError(`An import can include at most ${max} ${label}.`);
  return v;
}

function asString(v: unknown): string {
  if (typeof v !== "string") fail();
  return v;
}

function asKey(v: unknown): string {
  const s = asString(v);
  if (!s || s.length > 40) fail();
  return s;
}

function asId(v: unknown): string {
  const s = asString(v);
  if (!UUID.test(s)) fail();
  return s;
}

function asTarget(v: unknown): Record<string, unknown> {
  const t = asObject(v);
  if (t.kind !== "existing" && t.kind !== "new") fail();
  return t;
}

function uniqueKeys<T extends { key: string }>(list: T[]): T[] {
  if (new Set(list.map((x) => x.key)).size !== list.length) fail();
  return list;
}

// Shape-check an untrusted apply body. Business rules (conflicts, names) are analyzeImport's job.
export function parseApplyPayload(body: unknown): ApplyPayload {
  const obj = asObject(body);

  const casts = asArray(obj.casts, IMPORT_LIMITS.casts, "casts").map((raw) => {
    const c = asObject(raw);
    const t = asTarget(c.target);
    const target: CastTarget =
      t.kind === "existing" ? { kind: "existing", castId: asId(t.castId) } : { kind: "new", name: asString(t.name) };
    return { key: asKey(c.key), target };
  });

  const roles = asArray(obj.roles, IMPORT_LIMITS.roles, "roles").map((raw) => {
    const r = asObject(raw);
    const t = asTarget(r.target);
    const target: RoleTarget =
      t.kind === "existing"
        ? { kind: "existing", roleId: asId(t.roleId) }
        : {
            kind: "new",
            name: asString(t.name),
            isEnsemble: typeof t.isEnsemble === "boolean" ? t.isEnsemble : fail(),
          };
    return { key: asKey(r.key), target };
  });

  const performers = asArray(obj.performers, IMPORT_LIMITS.performers, "performers").map((raw) => {
    const p = asObject(raw);
    const t = asTarget(p.target);
    const target: PerformerTarget =
      t.kind === "existing"
        ? { kind: "existing", performerId: asId(t.performerId) }
        : { kind: "new", name: asString(t.name) };
    return { key: asKey(p.key), target };
  });

  const castings = asArray(obj.castings, IMPORT_LIMITS.castings, "castings").map((raw): ImportCasting => {
    const c = asObject(raw);
    if (!isAssignment(c.assignment)) fail();
    return {
      key: asKey(c.key),
      castKey: asKey(c.castKey),
      roleKey: asKey(c.roleKey),
      performerKey: asKey(c.performerKey),
      assignment: c.assignment,
    };
  });

  return {
    casts: uniqueKeys(casts),
    roles: uniqueKeys(roles),
    performers: uniqueKeys(performers),
    castings: uniqueKeys(castings),
  };
}
