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

export async function createRoles(input: { productionId: string; names: string[] }): Promise<Role[]> {
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) throw new ValidationError("At least one role name is required");

  // Append after any existing roles so display order stays stable.
  const { data: existing, error: maxErr } = await supabaseAdmin
    .from("roles")
    .select("display_order")
    .eq("production_id", input.productionId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (maxErr) throw new Error(maxErr.message);
  const base = existing && existing.length > 0 ? (existing[0].display_order ?? 0) + 1 : 0;

  const rows = names.map((name, i) => ({
    production_id: input.productionId,
    name,
    display_order: base + i,
  }));
  const { data, error } = await supabaseAdmin.from("roles").insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}

export async function updateRole(productionId: string, id: string, name: string): Promise<Role> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Role name is required");
  const { data, error } = await supabaseAdmin
    .from("roles")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Role not found");
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
