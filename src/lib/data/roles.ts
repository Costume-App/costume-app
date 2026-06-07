import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Role {
  id: string;
  production_id: string;
  name: string;
  display_order: number;
  notes: string | null;
  created_at: string;
}

export async function listRoles(productionId: string): Promise<Role[]> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("*")
    .eq("production_id", productionId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}

export async function createRole(input: { productionId: string; name: string }): Promise<Role> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Role name is required");
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ production_id: input.productionId, name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}

export async function setRoleNotes(productionId: string, id: string, notes: string): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .update({ notes: notes || null })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Role not found");
  return data as Role;
}

export async function deleteRole(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("roles")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}
