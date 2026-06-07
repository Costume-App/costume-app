import { supabaseAdmin } from "@/lib/supabase-admin";

export interface RoleImage {
  id: string;
  role_id: string;
  storage_path: string;
  created_at: string;
}

export async function listRoleImages(roleId: string): Promise<RoleImage[]> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .select("*")
    .eq("role_id", roleId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleImage[];
}

// All images for the given roles (one query), ordered oldest-first.
export async function listRoleImagesForRoles(roleIds: string[]): Promise<RoleImage[]> {
  if (roleIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .select("*")
    .in("role_id", roleIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleImage[];
}

// Distinct role ids (among the given roles) that have at least one image.
export async function roleIdsWithImages(roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .select("role_id")
    .in("role_id", roleIds);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => (r as { role_id: string }).role_id))];
}

export async function countRoleImages(roleId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("role_images")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addRoleImage(roleId: string, storagePath: string): Promise<RoleImage> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .insert({ role_id: roleId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RoleImage;
}

export async function deleteRoleImage(roleId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .delete()
    .eq("id", id)
    .eq("role_id", roleId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoleImage | null)?.storage_path ?? null;
}
