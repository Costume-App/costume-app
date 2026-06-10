import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProduction, type Production } from "@/lib/data/productions";
import { getPerformerProductionId } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";

// Confirms a production exists within the caller's org, or throws (404).
export async function assertProductionInOrg(
  orgId: string,
  productionId: string,
): Promise<Production> {
  const production = await getProduction(orgId, productionId);
  if (!production) throw new NotFoundError("Production not found");
  return production;
}

// Confirms a performer belongs to a production within the caller's org, or throws (404).
export async function assertPerformerInOrg(orgId: string, performerId: string): Promise<void> {
  const productionId = await getPerformerProductionId(performerId);
  if (!productionId) throw new NotFoundError("Performer not found");
  await assertProductionInOrg(orgId, productionId);
}

// Throws NotFoundError unless the role belongs to the given production.
export async function assertRoleInProduction(productionId: string, roleId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("id", roleId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Role not found in this production");
}

// Throws NotFoundError unless the costume design (piece) belongs to the given production.
export async function assertDesignInProduction(productionId: string, designId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("id")
    .eq("id", designId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Costume piece not found in this production");
}

// Throws NotFoundError unless the casting belongs to the given production.
export async function assertCastingInProduction(productionId: string, castingId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("castings")
    .select("id")
    .eq("id", castingId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Casting not found in this production");
}
