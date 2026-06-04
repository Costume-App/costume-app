import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

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
  value_numeric: number;
  unit: string;
  updated_at: string;
}

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
  const { data, error } = await supabaseAdmin
    .from("performers")
    .insert({ production_id: input.productionId, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Performer;
}

export async function deletePerformer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("performers").delete().eq("id", id);
  if (error) throw new Error(error.message);
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

export async function upsertMeasurement(input: {
  performerId: string;
  measurementKey: string;
  valueNumeric: number;
  unit: string;
}): Promise<PerformerMeasurement> {
  if (!Number.isFinite(input.valueNumeric)) {
    throw new ValidationError("Measurement must be a number");
  }
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .upsert(
      {
        performer_id: input.performerId,
        measurement_key: input.measurementKey,
        value_numeric: input.valueNumeric,
        unit: input.unit,
      },
      { onConflict: "performer_id,measurement_key" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PerformerMeasurement;
}
