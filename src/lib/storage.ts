import { supabaseAdmin } from "@/lib/supabase-admin";

export const ROLE_IMAGES_BUCKET = "role-images";

// Role and costume-design images share this private bucket, separated by path
// prefix (roles at `${prod}/${role}/…`, designs at `${prod}/designs/${design}/…`).
export async function uploadImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
}

// Map each path to a short-lived signed URL. Empty input → {}.
export async function signImageUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
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

export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
}

// Copy an object within the bucket (design photo → inventory photo live here).
export async function copyImage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).copy(fromPath, toPath);
  if (error) throw new Error(error.message);
}

// Backwards-compatible aliases used by the role-image routes (same bucket).
export const uploadRoleImage = uploadImage;
export const signRoleImageUrls = signImageUrls;
export const removeRoleImages = removeImages;
