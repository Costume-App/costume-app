import type { Assignment } from "@/lib/casting-assignment";
import type { Inferred, InferredCasting, InferredRole, PerformerMark, RawExtraction } from "@/lib/cast-import/types";
import { cleanName, matchKey } from "@/lib/cast-import/normalize";

interface Person {
  name: string;
  mark: PerformerMark;
}

interface CastBucket {
  label: string | null;
  people: Person[];
}

interface RoleAcc {
  name: string;
  group: boolean;
  casts: Map<string, CastBucket>; // by cast match key ("" = no cast named)
}

// Turn the AI's literal extraction into roles with decided assignments. The rules live here, not
// in the prompt, so they are deterministic and testable:
// - ensemble if the list calls it a group, or any cast has 2+ names that are all unmarked;
// - otherwise per cast: the name marked primary (else the first unmarked name) is primary, the
//   rest are understudies;
// - one character across several casts is one role.
export function inferCastList(raw: RawExtraction): Inferred {
  const castLabels: (string | null)[] = [];
  const castLabelByKey = new Map<string, string | null>();
  const roles = new Map<string, RoleAcc>();

  for (const entry of raw.entries) {
    const roleName = cleanName(entry.character);
    const roleKey = matchKey(roleName);
    if (!roleKey) continue;
    let role = roles.get(roleKey);
    if (!role) {
      role = { name: roleName, group: false, casts: new Map() };
      roles.set(roleKey, role);
    }
    role.group ||= entry.group_label;

    const castName = cleanName(entry.cast ?? "");
    const castKey = matchKey(castName);
    for (const performer of entry.performers) {
      const name = cleanName(performer.name);
      const personKey = matchKey(name);
      if (!personKey) continue;
      if (!castLabelByKey.has(castKey)) {
        const label = castKey === "" ? null : castName;
        castLabelByKey.set(castKey, label);
        castLabels.push(label);
      }
      let bucket = role.casts.get(castKey);
      if (!bucket) {
        bucket = { label: castLabelByKey.get(castKey) ?? null, people: [] };
        role.casts.set(castKey, bucket);
      }
      const seen = bucket.people.find((p) => matchKey(p.name) === personKey);
      if (!seen) bucket.people.push({ name, mark: performer.mark });
      else if (seen.mark === "unmarked") seen.mark = performer.mark;
    }
  }

  const inferred: InferredRole[] = [...roles.values()].map((role) => {
    const buckets = [...role.casts.values()];
    const isEnsemble =
      role.group || buckets.some((b) => b.people.length >= 2 && b.people.every((p) => p.mark === "unmarked"));
    const castings: InferredCasting[] = [];
    for (const bucket of buckets) {
      const primary = isEnsemble ? -1 : pickPrimary(bucket.people);
      bucket.people.forEach((person, i) => {
        const assignment: Assignment = isEnsemble ? "ensemble" : i === primary ? "primary" : "understudy";
        castings.push({ castLabel: bucket.label, performerName: person.name, assignment });
      });
    }
    return { name: role.name, isEnsemble, castings };
  });

  return { castLabels, roles: inferred };
}

function pickPrimary(people: Person[]): number {
  const marked = people.findIndex((p) => p.mark === "primary");
  return marked !== -1 ? marked : people.findIndex((p) => p.mark === "unmarked");
}
