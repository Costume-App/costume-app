import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface CostumeDesign {
  id: string;
  production_id: string;
  role_id: string;
  name: string;
  notes: string | null;
  inventory_item_id: string | null;
  display_order: number;
  created_at: string;
}

export async function listCostumeDesigns(productionId: string): Promise<CostumeDesign[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumeDesign[];
}

export async function createCostumeDesign(input: {
  productionId: string;
  roleId: string;
  name: string;
  inventoryItemId?: string | null;
}): Promise<CostumeDesign> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Piece name is required");
  const row: Record<string, unknown> = {
    production_id: input.productionId,
    role_id: input.roleId,
    name,
  };
  if (input.inventoryItemId) row.inventory_item_id = input.inventoryItemId;
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesign;
}

export async function updateCostumeDesign(
  productionId: string,
  id: string,
  name: string,
): Promise<CostumeDesign> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Piece name is required");
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Costume piece not found");
  return data as CostumeDesign;
}

export async function setCostumeDesignNotes(
  productionId: string,
  id: string,
  notes: string,
): Promise<CostumeDesign> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .update({ notes: notes || null })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Costume piece not found");
  return data as CostumeDesign;
}

export async function deleteCostumeDesign(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("costume_designs")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
