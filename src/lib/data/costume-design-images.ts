import { supabaseAdmin } from "@/lib/supabase-admin";

export interface CostumeDesignImage {
  id: string;
  costume_design_id: string;
  storage_path: string;
  created_at: string;
}

export async function listCostumeDesignImages(designId: string): Promise<CostumeDesignImage[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .select("*")
    .eq("costume_design_id", designId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumeDesignImage[];
}

export async function countCostumeDesignImages(designId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("costume_design_images")
    .select("id", { count: "exact", head: true })
    .eq("costume_design_id", designId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addCostumeDesignImage(designId: string, storagePath: string): Promise<CostumeDesignImage> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .insert({ costume_design_id: designId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesignImage;
}

export async function deleteCostumeDesignImage(designId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .delete()
    .eq("id", id)
    .eq("costume_design_id", designId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CostumeDesignImage | null)?.storage_path ?? null;
}
