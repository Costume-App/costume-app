import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface Production {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductionInput {
  orgId: string;
  createdBy: string;
  title: string;
  notes: string | null;
}

export async function listProductions(orgId: string): Promise<Production[]> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("org_id", orgId)
    .order("show_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Production[];
}

export async function getProduction(
  orgId: string,
  productionId: string,
): Promise<Production | null> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Production) ?? null;
}

export async function createProduction(input: CreateProductionInput): Promise<Production> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("Title is required");

  const { data, error } = await supabaseAdmin
    .from("productions")
    .insert({
      org_id: input.orgId,
      created_by: input.createdBy,
      title,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Production;
}

export async function updateProduction(orgId: string, id: string, title: string): Promise<Production> {
  const trimmed = title.trim();
  if (!trimmed) throw new ValidationError("Title is required");
  const { data, error } = await supabaseAdmin
    .from("productions")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Production not found");
  return data as Production;
}

export async function deleteProduction(orgId: string, productionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("productions")
    .delete()
    .eq("id", productionId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
