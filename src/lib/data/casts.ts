import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Cast {
  id: string;
  production_id: string;
  name: string;
  color: string;
  is_default: boolean;
  display_order: number;
  created_at: string;
}

export async function listCasts(productionId: string): Promise<Cast[]> {
  const { data, error } = await supabaseAdmin
    .from("casts")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Cast[];
}

export async function createCast(input: {
  productionId: string;
  name: string;
  color?: string;
}): Promise<Cast> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Cast name is required");
  const { data, error } = await supabaseAdmin
    .from("casts")
    .insert({ production_id: input.productionId, name, color: input.color ?? "slate" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Cast;
}

export async function updateCast(
  productionId: string,
  id: string,
  name: string,
  color?: string,
): Promise<Cast> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Cast name is required");
  const patch: { name: string; color?: string } = { name: trimmed };
  if (color !== undefined) patch.color = color;
  const { data, error } = await supabaseAdmin
    .from("casts")
    .update(patch)
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Cast not found");
  return data as Cast;
}

export async function deleteCast(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("casts")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
