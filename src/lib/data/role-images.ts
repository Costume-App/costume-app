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
