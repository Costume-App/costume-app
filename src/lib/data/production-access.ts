import { getProduction, type Production } from "@/lib/data/productions";
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
