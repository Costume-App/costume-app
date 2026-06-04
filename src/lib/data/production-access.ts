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
