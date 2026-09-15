import type { Assignment } from "@/lib/casting-assignment";
import type { CastTarget, Draft, DraftRole, PerformerTarget } from "@/lib/cast-import/types";

// Pure edits the review screen applies to a draft. Each returns a new draft.

export function setCastTarget(draft: Draft, castKey: string, target: CastTarget): Draft {
  return { ...draft, casts: draft.casts.map((c) => (c.key === castKey ? { ...c, target } : c)) };
}

// Applies to every casting of that person — they're one performer across roles.
export function setPerformerTarget(draft: Draft, performerKey: string, target: PerformerTarget): Draft {
  return { ...draft, performers: draft.performers.map((p) => (p.key === performerKey ? { ...p, target } : p)) };
}

export function setRoleTarget(
  draft: Draft,
  roleKey: string,
  choice: "new" | { kind: "existing"; roleId: string },
): Draft {
  return {
    ...draft,
    roles: draft.roles.map((r): DraftRole => {
      if (r.key !== roleKey) return r;
      if (choice !== "new") return { ...r, target: choice };
      if (r.target.kind === "new") return r;
      const isEnsemble = draft.castings.some((c) => c.roleKey === roleKey && c.assignment === "ensemble");
      return { ...r, target: { kind: "new", name: r.sourceName, isEnsemble } };
    }),
  };
}

export function renameNewRole(draft: Draft, roleKey: string, name: string): Draft {
  return {
    ...draft,
    roles: draft.roles.map((r): DraftRole =>
      r.key === roleKey && r.target.kind === "new" ? { ...r, target: { ...r.target, name } } : r,
    ),
  };
}

export function setRoleEnsemble(draft: Draft, roleKey: string, isEnsemble: boolean): Draft {
  const next: Draft = {
    ...draft,
    roles: draft.roles.map((r): DraftRole =>
      r.key === roleKey && r.target.kind === "new" ? { ...r, target: { ...r.target, isEnsemble } } : r,
    ),
  };
  return fitRoleToType(next, roleKey, isEnsemble);
}

// Re-label a role's castings to fit a role type: all ensemble, or per cast one primary (keeping an
// existing primary choice, else the first person) and the rest understudies.
export function fitRoleToType(draft: Draft, roleKey: string, isEnsemble: boolean): Draft {
  const roleCastings = draft.castings.filter((c) => c.roleKey === roleKey);
  const primaryByCast = new Map<string, string>();
  if (!isEnsemble) {
    for (const c of roleCastings) {
      if (c.assignment === "primary" && !primaryByCast.has(c.castKey)) primaryByCast.set(c.castKey, c.key);
    }
    for (const c of roleCastings) {
      if (!primaryByCast.has(c.castKey)) primaryByCast.set(c.castKey, c.key);
    }
  }
  return {
    ...draft,
    castings: draft.castings.map((c) => {
      if (c.roleKey !== roleKey) return c;
      const assignment: Assignment = isEnsemble
        ? "ensemble"
        : primaryByCast.get(c.castKey) === c.key
          ? "primary"
          : "understudy";
      return { ...c, assignment };
    }),
  };
}

// Setting a primary demotes whoever else was primary for that role in that cast.
export function setAssignment(draft: Draft, castingKey: string, assignment: "primary" | "understudy"): Draft {
  const target = draft.castings.find((c) => c.key === castingKey);
  if (!target) return draft;
  return {
    ...draft,
    castings: draft.castings.map((c) => {
      if (c.key === castingKey) return { ...c, assignment };
      if (
        assignment === "primary" &&
        c.assignment === "primary" &&
        c.castKey === target.castKey &&
        c.roleKey === target.roleKey
      ) {
        return { ...c, assignment: "understudy" };
      }
      return c;
    }),
  };
}

export function removeCasting(draft: Draft, castingKey: string): Draft {
  return { ...draft, castings: draft.castings.filter((c) => c.key !== castingKey) };
}

export function removeRole(draft: Draft, roleKey: string): Draft {
  return {
    ...draft,
    roles: draft.roles.filter((r) => r.key !== roleKey),
    castings: draft.castings.filter((c) => c.roleKey !== roleKey),
  };
}
