import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface ShowDate {
  id: string;
  production_id: string;
  show_date: string;
  show_time: string | null;
  label: string | null;
  created_at: string;
}

export async function listShowDates(productionIds: string[]): Promise<ShowDate[]> {
  if (productionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .select("*")
    .in("production_id", productionIds)
    .order("show_date", { ascending: true })
    .order("show_time", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShowDate[];
}

export async function addShowDate(
  productionId: string,
  date: string,
  time: string | null,
  label?: string | null,
): Promise<ShowDate> {
  const show_date = date.trim();
  if (!show_date) throw new ValidationError("Show date is required");
  const labelClean = label && label.trim() ? label.trim() : null;
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .insert({ production_id: productionId, show_date, show_time: time || null, label: labelClean })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShowDate;
}

export async function updateShowDate(
  productionId: string,
  id: string,
  patch: { show_date?: string; show_time?: string | null; label?: string | null },
): Promise<ShowDate> {
  const update: { show_date?: string; show_time?: string | null; label?: string | null } = {};
  if (patch.show_date !== undefined) {
    const trimmed = patch.show_date.trim();
    if (!trimmed) throw new ValidationError("Show date is required");
    update.show_date = trimmed;
  }
  if (patch.show_time !== undefined) {
    update.show_time = patch.show_time || null;
  }
  if (patch.label !== undefined) {
    update.label = patch.label && patch.label.trim() ? patch.label.trim() : null;
  }
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .update(update)
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Showing not found");
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
