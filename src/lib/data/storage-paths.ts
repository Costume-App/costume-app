import { supabaseAdmin } from "@/lib/supabase-admin";

// Image storage paths, gathered so a delete can remove the files BEFORE the rows
// cascade away. The bucket key format (see src/lib/storage.ts) carries no org and
// no production for inventory images, so the only way to find an owner's files is
// through these tables — once the rows are gone the objects are unreachable.

async function pathsIn(table: string, column: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin.from(table).select("storage_path").in(column, ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { storage_path: string }).storage_path);
}

async function idsFor(table: string, productionId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from(table).select("id").eq("production_id", productionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function listRoleImagePaths(roleId: string): Promise<string[]> {
  return pathsIn("role_images", "role_id", [roleId]);
}

export async function listDesignImagePaths(designId: string): Promise<string[]> {
  return pathsIn("costume_design_images", "costume_design_id", [designId]);
}

// Every image belonging to a production: role photos for its roles, design photos
// for its designs.
export async function listProductionImagePaths(productionId: string): Promise<string[]> {
  const roleIds = await idsFor("roles", productionId);
  const designIds = await idsFor("costume_designs", productionId);
  const rolePaths = await pathsIn("role_images", "role_id", roleIds);
  const designPaths = await pathsIn("costume_design_images", "costume_design_id", designIds);
  return [...rolePaths, ...designPaths];
}
