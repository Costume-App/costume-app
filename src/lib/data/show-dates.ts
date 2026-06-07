import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface ShowDate {
  id: string;
  production_id: string;
  show_date: string;
  created_at: string;
}

export async function listShowDates(productionIds: string[]): Promise<ShowDate[]> {
  if (productionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .select("*")
    .in("production_id", productionIds)
    .order("show_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShowDate[];
}

export async function addShowDate(productionId: string, date: string): Promise<ShowDate> {
  const show_date = date.trim();
  if (!show_date) throw new ValidationError("Show date is required");
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .insert({ production_id: productionId, show_date })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShowDate;
}

export async function deleteShowDate(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("show_dates")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
