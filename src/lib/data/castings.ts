import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import { createPerformer, deletePerformer, type Performer } from "@/lib/data/performers";

export type Assignment = "primary" | "understudy";

export interface Casting {
  id: string;
  production_id: string;
  cast_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
  created_at: string;
}

export async function listCastings(productionId: string): Promise<Casting[]> {
  const { data, error } = await supabaseAdmin
    .from("castings")
    .select("*")
    .eq("production_id", productionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Casting[];
}

export async function addCastMember(input: {
  productionId: string;
  castId: string;
  roleId: string;
  name: string;
  assignment: Assignment;
}): Promise<{ performer: Performer; casting: Casting }> {
  if (input.assignment !== "primary" && input.assignment !== "understudy") {
    throw new ValidationError("Invalid assignment");
  }
  const performer = await createPerformer({ productionId: input.productionId, label: input.name });
  const { data, error } = await supabaseAdmin
    .from("castings")
    .insert({
      production_id: input.productionId,
      cast_id: input.castId,
      role_id: input.roleId,
      performer_id: performer.id,
      assignment: input.assignment,
    })
    .select()
    .single();
  if (error) {
    // The casting failed, so the performer we just created would be orphaned — roll it back.
    await deletePerformer(performer.id);
    // 23505 = unique violation: a primary already exists for this cast + role.
    if (error.code === "23505") {
      throw new ValidationError("This role already has a primary for this cast.");
    }
    throw new Error(error.message);
  }
  return { performer, casting: data as Casting };
}
