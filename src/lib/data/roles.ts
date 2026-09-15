import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Role {
  id: string;
  production_id: string;
  name: string;
  display_order: number;
  notes: string | null;
  is_ensemble: boolean;
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

export async function createRole(input: {
  productionId: string;
  name: string;
  isEnsemble?: boolean;
}): Promise<Role> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Role name is required");
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ production_id: input.productionId, name, is_ensemble: input.isEnsemble === true })
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

// Flip a role between regular and ensemble. The set_role_ensemble SQL function converts the
// role's castings in the same transaction (see migration 0033).
export async function setRoleEnsemble(productionId: string, id: string, isEnsemble: boolean): Promise<Role> {
  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!role) throw new NotFoundError("Role not found");
  if ((role as Role).is_ensemble === isEnsemble) return role as Role;
  const { error: rpcError } = await supabaseAdmin.rpc("set_role_ensemble", {
    p_role_id: id,
    p_is_ensemble: isEnsemble,
  });
  if (rpcError) throw new Error(rpcError.message);
  return { ...(role as Role), is_ensemble: isEnsemble };
}

export async function deleteRole(productionId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("roles")
    .delete()
    .eq("id", id)
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
}

// Insert a role preserving name/notes/display_order/is_ensemble (used by the share copy engine).
export async function insertRoleCopy(input: {
  productionId: string;
  name: string;
  notes: string | null;
  displayOrder: number;
  isEnsemble: boolean;
}): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({
      production_id: input.productionId,
      name: input.name,
      notes: input.notes,
      display_order: input.displayOrder,
      is_ensemble: input.isEnsemble,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Role;
}
