import { supabaseAdmin } from "@/lib/supabase-admin";

export interface InventoryItemImage {
  id: string;
  inventory_item_id: string;
  storage_path: string;
  created_at: string;
}

export async function listInventoryItemImages(itemId: string): Promise<InventoryItemImage[]> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("*")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryItemImage[];
}

export async function countInventoryItemImages(itemId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addInventoryItemImage(itemId: string, storagePath: string): Promise<InventoryItemImage> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .insert({ inventory_item_id: itemId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryItemImage;
}

export async function deleteInventoryItemImage(itemId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .delete()
    .eq("id", id)
    .eq("inventory_item_id", itemId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InventoryItemImage | null)?.storage_path ?? null;
}

// Earliest image path per item, for library/picker thumbnails. Empty input → {}.
export async function firstImagePaths(itemIds: string[]): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from("inventory_item_images")
    .select("inventory_item_id, storage_path")
    .in("inventory_item_id", itemIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { inventory_item_id: string; storage_path: string }[]) {
    if (!(row.inventory_item_id in map)) map[row.inventory_item_id] = row.storage_path;
  }
  return map;
}
