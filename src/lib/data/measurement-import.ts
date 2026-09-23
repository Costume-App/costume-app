import { supabaseAdmin } from "@/lib/supabase-admin";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurementsForPerformers, listPerformers, MAX_PERFORMER_NOTES } from "@/lib/data/performers";
import { ConflictError, ValidationError } from "@/lib/errors";
import { matchKey } from "@/lib/cast-import/normalize";
import { STALE_IMPORT_MESSAGE } from "@/lib/measurement-import/payload";
import type { ApplyPayload, ExistingData, ImportResult, MeasurementMap } from "@/lib/measurement-import/types";

// The production as matching and the review's diff see it.
export async function loadMeasurementImportContext(productionId: string): Promise<ExistingData> {
  const [performers, definitions] = await Promise.all([listPerformers(productionId), listMeasurementDefinitions()]);
  const rows = await getMeasurementsForPerformers(performers.map((p) => p.id));
  const byPerformer = new Map<string, MeasurementMap>();
  for (const row of rows) {
    const map = byPerformer.get(row.performer_id) ?? {};
    const value = row.value_text ?? row.value_numeric;
    if (value !== null) map[row.measurement_key] = value;
    byPerformer.set(row.performer_id, map);
  }
  return {
    performers: performers.map((p) => ({ id: p.id, name: p.label, notes: p.notes, measurements: byPerformer.get(p.id) ?? {} })),
    definitions: definitions.map((d) => ({
      key: d.key,
      label: d.label,
      unit: d.unit,
      input_type: d.input_type,
      display_order: d.display_order,
    })),
  };
}

function notesTooLongMessage(label: string): string {
  return `${label}'s notes would be too long after this import. Shorten their notes or untick the notes block.`;
}

// Write a reviewed import in one transaction via import_measurement_forms (migrations 0038, 0039).
// `existing` must be freshly loaded by the caller: the review may be stale, and a "new" performer
// whose name now matches an existing one would recreate the duplicate rows migration 0036 exists
// to clean up, so that case is refused here instead of created. Two forms in the same payload
// that would create the same new performer, or that both target the same existing performer, are
// refused too, before either one reaches the RPC.
export async function applyMeasurementImport(
  productionId: string,
  payload: ApplyPayload,
  existing: ExistingData,
): Promise<ImportResult> {
  const labelById = new Map(existing.performers.map((p) => [p.id, p.name]));
  const notesById = new Map(existing.performers.map((p) => [p.id, p.notes]));
  const keys = new Set(existing.performers.map((p) => matchKey(p.name)));
  const takenByThisImport = new Map<string, string>();
  const existingIdsInThisImport = new Set<string>();
  for (const form of payload.forms) {
    if (form.performer.kind === "existing") {
      const label = labelById.get(form.performer.performerId);
      if (label === undefined) throw new ConflictError(STALE_IMPORT_MESSAGE);
      if (existingIdsInThisImport.has(form.performer.performerId)) {
        throw new ValidationError(`Two forms are for ${label}. Import them separately or remove one.`);
      }
      existingIdsInThisImport.add(form.performer.performerId);

      // Mirror the RPC's concat_ws(E'\n\n', nullif(notes, ''), append) exactly: an empty string
      // counts as no existing notes, and only a non-empty append (after trim) is written at all.
      const appendTrimmed = (form.notesAppend ?? "").trim();
      if (appendTrimmed) {
        const existingNotes = notesById.get(form.performer.performerId) ?? null;
        const existingLength = existingNotes ? existingNotes.length : 0;
        const resultLength = existingLength > 0 ? existingLength + 2 + appendTrimmed.length : appendTrimmed.length;
        if (resultLength > MAX_PERFORMER_NOTES) {
          throw new ValidationError(notesTooLongMessage(label));
        }
      }
    }
    if (form.performer.kind === "new") {
      const key = matchKey(form.performer.name);
      if (keys.has(key)) throw new ConflictError(STALE_IMPORT_MESSAGE);
      const takenName = takenByThisImport.get(key);
      if (takenName !== undefined) {
        throw new ValidationError(`Two forms create the same new performer: ${takenName}. Pick one performer for both.`);
      }
      takenByThisImport.set(key, form.performer.name);
    }
  }

  const rpcPayload = {
    forms: payload.forms.map((form) => ({
      performer: form.performer.kind === "existing" ? { id: form.performer.performerId } : { name: form.performer.name },
      measurements: form.measurements.map((m) => ({ key: m.key, value_numeric: m.valueNumeric, value_text: m.valueText })),
      notes_append: form.notesAppend,
    })),
  };
  const { data, error } = await supabaseAdmin.rpc("import_measurement_forms", {
    p_production_id: productionId,
    p_payload: rpcPayload,
  });
  if (error) {
    if (error.code === "P0002") throw new ConflictError(STALE_IMPORT_MESSAGE);
    // 0039 re-checks the notes cap under the row lock, for a parallel import that passed the check above.
    if (error.code === "22001") throw new ValidationError(notesTooLongMessage(error.details || "A performer"));
    throw new Error(error.message);
  }
  const counts = (data ?? {}) as { performers?: number; measurements?: number; notes?: number };
  return {
    performersCreated: counts.performers ?? 0,
    measurementsWritten: counts.measurements ?? 0,
    notesAppended: counts.notes ?? 0,
  };
}
