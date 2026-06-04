import { supabaseAdmin } from "@/lib/supabase-admin";

export interface MeasurementDefinition {
  key: string;
  label: string;
  unit: string;
  input_type: string;
  help_text: string | null;
  display_order: number;
}

export async function listMeasurementDefinitions(): Promise<MeasurementDefinition[]> {
  const { data, error } = await supabaseAdmin
    .from("measurement_definitions")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MeasurementDefinition[];
}
