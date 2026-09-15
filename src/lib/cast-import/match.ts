import type {
  Draft,
  DraftCast,
  DraftPerformer,
  DraftRole,
  ExistingData,
  ImportCasting,
  Inferred,
} from "@/lib/cast-import/types";
import { matchKey } from "@/lib/cast-import/normalize";

// Pre-select matches against what the production already has. Matching is normalized-exact only;
// when more than one existing performer shares a name we propose a new person and let the user pick.
export function buildDraft(inferred: Inferred, existing: ExistingData): Draft {
  const defaultCast = existing.casts.find((c) => c.isDefault) ?? existing.casts[0];

  const casts = inferred.castLabels.map((label, i): DraftCast => {
    const key = `c${i}`;
    if (label === null) {
      return {
        key,
        label,
        target: defaultCast ? { kind: "existing", castId: defaultCast.id } : { kind: "new", name: "Main Cast" },
      };
    }
    const match = existing.casts.find((c) => matchKey(c.name) === matchKey(label));
    return { key, label, target: match ? { kind: "existing", castId: match.id } : { kind: "new", name: label } };
  });
  const castKeyByLabel = new Map(inferred.castLabels.map((label, i) => [matchKey(label ?? ""), `c${i}`]));

  const roles = inferred.roles.map((role, i): DraftRole => {
    const match = existing.roles.find((r) => matchKey(r.name) === matchKey(role.name));
    return {
      key: `r${i}`,
      sourceName: role.name,
      target: match
        ? { kind: "existing", roleId: match.id }
        : { kind: "new", name: role.name, isEnsemble: role.isEnsemble },
    };
  });

  const performers: DraftPerformer[] = [];
  const performerKeyByName = new Map<string, string>();
  const castings: ImportCasting[] = [];
  inferred.roles.forEach((role, roleIndex) => {
    for (const casting of role.castings) {
      const nameKey = matchKey(casting.performerName);
      let performerKey = performerKeyByName.get(nameKey);
      if (!performerKey) {
        performerKey = `p${performers.length}`;
        performerKeyByName.set(nameKey, performerKey);
        const candidateIds = existing.performers.filter((p) => matchKey(p.name) === nameKey).map((p) => p.id);
        performers.push({
          key: performerKey,
          sourceName: casting.performerName,
          target:
            candidateIds.length === 1
              ? { kind: "existing", performerId: candidateIds[0] }
              : { kind: "new", name: casting.performerName },
          candidateIds,
        });
      }
      castings.push({
        key: `k${castings.length}`,
        castKey: castKeyByLabel.get(matchKey(casting.castLabel ?? "")) ?? "c0",
        roleKey: `r${roleIndex}`,
        performerKey,
        assignment: casting.assignment,
      });
    }
  });

  return { casts, roles, performers, castings };
}
