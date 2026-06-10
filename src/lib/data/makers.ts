import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Maker {
  id: string;
  org_id: string;
  name: string;
  color: string;
  created_at: string;
}

export async function listMakers(orgId: string): Promise<Maker[]> {
  const { data, error } = await supabaseAdmin
    .from("makers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Maker[];
}

export async function createMaker(orgId: string, input: { name: string; color?: string }): Promise<Maker> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Maker name is required");
  const { data, error } = await supabaseAdmin
    .from("makers")
    .insert({ org_id: orgId, name, color: input.color ?? "slate" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Maker;
}

export async function updateMaker(
  orgId: string,
  id: string,
  patch: { name?: string; color?: string },
): Promise<Maker> {
  const update: { name?: string; color?: string } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Maker name is required");
    update.name = trimmed;
  }
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await supabaseAdmin
    .from("makers")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Maker not found");
  return data as Maker;
}

export async function deleteMaker(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("makers")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
