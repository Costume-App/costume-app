import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError, PG_INVALID_TEXT_REPRESENTATION } from "@/lib/errors";

export interface Performer {
  id: string;
  production_id: string;
  label: string;
  notes: string | null;
  created_at: string;
}

export interface PerformerMeasurement {
  id: string;
  performer_id: string;
  measurement_key: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string;
  updated_at: string;
}

export const MAX_PERFORMER_NAME = 100;

export async function listPerformers(productionId: string): Promise<Performer[]> {
  const { data, error } = await supabaseAdmin
    .from("performers")
    .select("*")
    .eq("production_id", productionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Performer[];
}

export async function createPerformer(input: {
  productionId: string;
  label: string;
}): Promise<Performer> {
  const label = input.label.trim();
  if (!label) throw new ValidationError("Performer name is required");
  if (label.length > MAX_PERFORMER_NAME) {
    throw new ValidationError(`Performer name must be ${MAX_PERFORMER_NAME} characters or fewer`);
  }
  const { data, error } = await supabaseAdmin
    .from("performers")
    .insert({ production_id: input.productionId, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Performer;
}

export async function updatePerformer(id: string, label: string): Promise<Performer> {
  const trimmed = label.trim();
  if (!trimmed) throw new ValidationError("Name is required");
  if (trimmed.length > MAX_PERFORMER_NAME) {
    throw new ValidationError(`Name must be ${MAX_PERFORMER_NAME} characters or fewer`);
  }
  const { data, error } = await supabaseAdmin
    .from("performers")
    .update({ label: trimmed })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Performer not found");
  return data as Performer;
}

export async function deletePerformer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("performers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getPerformer(id: string): Promise<Performer | null> {
  const { data, error } = await supabaseAdmin.from("performers").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === PG_INVALID_TEXT_REPRESENTATION) return null;
    throw new Error(error.message);
  }
  return (data as Performer | null) ?? null;
}

export async function getPerformerProductionId(id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("performers")
    .select("production_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.production_id as string) ?? null;
}

export async function getMeasurements(performerId: string): Promise<PerformerMeasurement[]> {
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .select("*")
    .eq("performer_id", performerId)
    .order("measurement_key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PerformerMeasurement[];
}

// All measurement rows for the given performers (one query).
export async function getMeasurementsForPerformers(
  performerIds: string[],
): Promise<PerformerMeasurement[]> {
  if (performerIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .select("*")
    .in("performer_id", performerIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as PerformerMeasurement[];
}

const FILLED_COUNTS_PAGE_SIZE = 1000;

// How many measurement fields each performer has filled in, keyed by performer id.
// Each (performer_id, measurement_key) row is unique, so a row count == filled-field count.
// Paginated: PostgREST silently caps a single select at its max-rows setting, and this count now
// feeds the combine feature's keeper tie-break, so an undercount past that cap can flip a merge.
export async function getFilledMeasurementCounts(
  performerIds: string[],
): Promise<Record<string, number>> {
  if (performerIds.length === 0) return {};
  const counts: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("performer_measurements")
      .select("performer_id")
      .in("performer_id", performerIds)
      .order("id")
      .range(from, from + FILLED_COUNTS_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { performer_id: string }[];
    for (const row of rows) {
      counts[row.performer_id] = (counts[row.performer_id] ?? 0) + 1;
    }
    if (rows.length < FILLED_COUNTS_PAGE_SIZE) break;
    from += FILLED_COUNTS_PAGE_SIZE;
  }
  return counts;
}

export async function upsertMeasurement(input: {
  performerId: string;
  measurementKey: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit: string;
}): Promise<PerformerMeasurement> {
  // Definition-agnostic by design: a non-empty valueText is stored as text, otherwise
  // the numeric value is used. The caller (MeasurementForm, via measurementPayload)
  // sends the field that matches the definition's input_type, so we don't re-look it up.
  const text = typeof input.valueText === "string" ? input.valueText.trim() : "";
  let value_numeric: number | null = null;
  let value_text: string | null = null;
  if (text) {
    value_text = text;
  } else if (input.valueNumeric != null) {
    if (!Number.isFinite(input.valueNumeric)) {
      throw new ValidationError("Measurement must be a number");
    }
    value_numeric = input.valueNumeric;
  } else {
    throw new ValidationError("Measurement value is required");
  }
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .upsert(
      {
        performer_id: input.performerId,
        measurement_key: input.measurementKey,
        value_numeric,
        value_text,
        unit: input.unit,
      },
      { onConflict: "performer_id,measurement_key" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PerformerMeasurement;
}
