import { supabaseAdmin } from "@/lib/supabase-admin";

export const ROLE_IMAGES_BUCKET = "role-images";

export async function uploadRoleImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
}

// Map each path to a short-lived signed URL. Empty input → {}.
export async function signRoleImageUrls(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

export async function removeRoleImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
}
