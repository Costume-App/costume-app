import { matchKey } from "@/lib/cast-import/normalize";
import { fieldStatus, preChecked } from "@/lib/measurement-import/status";
import type { ExistingData, FormDraft, FormSelection, PerformerTarget } from "@/lib/measurement-import/types";

// The ticks a card starts with for its chosen performer: new and changed values on, the rest off.
export function initialSelection(draft: FormDraft, existing: ExistingData): FormSelection {
  const target = draft.performer;
  const chosen = target.kind === "existing" ? existing.performers.find((p) => p.id === target.performerId) : undefined;
  const saved = chosen?.measurements ?? {};
  const fields: Record<string, boolean> = {};
  for (const f of draft.fields) fields[f.key] = preChecked(fieldStatus(f, saved[f.key]));
  return { fields, notes: draft.notesToAppend !== "" };
}

// Whether a performer change picks a different person, so the ticks must be re-derived. Editing
// the new performer's name is not a different person and keeps the ticks the user set.
export function targetChanged(prev: PerformerTarget, next: PerformerTarget): boolean {
  if (prev.kind !== next.kind) return true;
  return prev.kind === "existing" && next.kind === "existing" && prev.performerId !== next.performerId;
}

// Whether this card sends anything to the apply route (mirrors toApplyPayload's filter).
export function contributes(draft: FormDraft, selection: FormSelection | undefined): boolean {
  if (!selection) return false;
  const ticked = draft.fields.some((f) => selection.fields[f.key] && (f.valueNumeric !== null || f.valueText !== null));
  return ticked || (selection.notes && draft.notesToAppend !== "");
}

export interface ReviewBlocks {
  missingName: string[]; // draft ids choosing a new performer with no name yet
  cards: Record<string, string>; // draft id -> inline message that blocks the import
}

// Everything that stops the import, found before the apply route refuses it: a new performer with
// no name, a new performer whose name is already in the production, and two forms for one person.
export function reviewBlocks(
  drafts: FormDraft[],
  existing: ExistingData,
  selections: Record<string, FormSelection>,
): ReviewBlocks {
  const missingName: string[] = [];
  const cards: Record<string, string> = {};
  const existingKeys = new Set(existing.performers.map((p) => matchKey(p.name)));
  const labelById = new Map(existing.performers.map((p) => [p.id, p.name]));

  for (const d of drafts) {
    if (d.performer.kind !== "new") continue;
    if (d.performer.name.trim() === "") missingName.push(d.id);
    else if (existingKeys.has(matchKey(d.performer.name))) {
      cards[d.id] = `${d.performer.name.trim()} is already in this production. Pick them above, or change the name.`;
    }
  }

  // Only forms that send something reach the apply route, so only those can collide there.
  const byExisting = new Map<string, string[]>();
  const byNewKey = new Map<string, string[]>();
  for (const d of drafts) {
    if (cards[d.id] || !contributes(d, selections[d.id])) continue;
    const target = d.performer;
    if (target.kind === "existing") byExisting.set(target.performerId, [...(byExisting.get(target.performerId) ?? []), d.id]);
    else if (target.name.trim() !== "") {
      const key = matchKey(target.name);
      byNewKey.set(key, [...(byNewKey.get(key) ?? []), d.id]);
    }
  }
  for (const [performerId, ids] of byExisting) {
    if (ids.length < 2) continue;
    const label = labelById.get(performerId) ?? "this performer";
    for (const id of ids) cards[id] = `Another form is also for ${label}. Remove one, or pick a different performer.`;
  }
  for (const ids of byNewKey.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const d = drafts.find((x) => x.id === id);
      const name = d && d.performer.kind === "new" ? d.performer.name.trim() : "";
      cards[id] = `Another form also adds ${name} as a new performer. Pick a different performer for one of them.`;
    }
  }
  return { missingName, cards };
}
