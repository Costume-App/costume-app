import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";

export interface Production {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  show_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductionInput {
  orgId: string;
  createdBy: string;
  title: string;
  showDate: string | null;
  notes: string | null;
}

export async function listProductions(orgId: string): Promise<Production[]> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("org_id", orgId)
    .order("show_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Production[];
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
      show_date: input.showDate,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Production;
}
