import { supabaseAdmin } from "@/lib/supabase-admin";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createPerformer, deletePerformer, getPerformer, type Performer } from "@/lib/data/performers";
import { isAssignment, type Assignment } from "@/lib/casting-assignment";

export type { Assignment };

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

// Cast someone in a role. Pass `performerId` to reuse an existing performer from this production
// (their measurements come along), or `name` to create a new performer.
export async function addCastMember(input: {
  productionId: string;
  castId: string;
  roleId: string;
  roleIsEnsemble: boolean;
  assignment: Assignment;
  name?: string;
  performerId?: string;
}): Promise<{ performer: Performer; casting: Casting }> {
  if (!isAssignment(input.assignment)) {
    throw new ValidationError("Invalid assignment");
  }
  if (input.roleIsEnsemble !== (input.assignment === "ensemble")) {
    throw new ValidationError(
      input.roleIsEnsemble
        ? "Ensemble roles don't have a primary or understudies."
        : "Only ensemble roles take ensemble members.",
    );
  }

  let performer: Performer;
  let created = false;
  if (input.performerId) {
    const existing = await getPerformer(input.performerId);
    if (!existing || existing.production_id !== input.productionId) {
      throw new NotFoundError("Performer not found");
    }
    performer = existing;
  } else {
    performer = await createPerformer({ productionId: input.productionId, label: input.name ?? "" });
    created = true;
  }

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
    // Only roll back a performer we just created — never delete a reused one.
    if (created) await deletePerformer(performer.id);
    if (error.code === "23505") {
      if (error.message.includes("castings_cast_role_performer_key")) {
        throw new ValidationError("That performer is already in this role for this cast.");
      }
      throw new ValidationError("This role already has a primary for this cast.");
    }
    throw new Error(error.message);
  }
  return { performer, casting: data as Casting };
}

// Unassign one casting. If the performer has no castings left anywhere in the production,
// delete the performer too (their measurements cascade).
export async function removeCasting(
  productionId: string,
  castingId: string,
): Promise<{ performerDeleted: boolean }> {
  const { data: casting, error: findError } = await supabaseAdmin
    .from("castings")
    .select("performer_id")
    .eq("id", castingId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!casting) throw new NotFoundError("Casting not found");

  const { error: deleteError } = await supabaseAdmin.from("castings").delete().eq("id", castingId);
  if (deleteError) throw new Error(deleteError.message);

  const performerId = (casting as { performer_id: string }).performer_id;
  const { data: remaining, error: remainingError } = await supabaseAdmin
    .from("castings")
    .select("id")
    .eq("performer_id", performerId)
    .limit(1);
  if (remainingError) throw new Error(remainingError.message);
  if (remaining && remaining.length > 0) return { performerDeleted: false };

  await deletePerformer(performerId);
  return { performerDeleted: true };
}
