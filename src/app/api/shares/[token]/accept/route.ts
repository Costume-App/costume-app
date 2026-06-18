import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { acceptProductionShare } from "@/lib/data/production-shares";
import { canCreateProduction, consumeProductionUnlock } from "@/lib/data/billing";
import { PlanLimitError } from "@/lib/errors";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await getAuthContext();
    const { token } = await params;
    const gate = await canCreateProduction(orgId);
    if (!gate.allowed) throw new PlanLimitError("needs_unlock");
    const { productionId } = await acceptProductionShare({ token, recipientOrgId: orgId, userId });
    if (!gate.unlimited) {
      const consumed = await consumeProductionUnlock(orgId, productionId);
      if (!consumed) {
        // Non-atomic, same caveat as double-accept: the copy already landed.
        // Log and let it through rather than delete a freshly-copied production.
        console.error("Accepted share but no unlock to consume (race):", { orgId, productionId });
      }
    }
    return NextResponse.json({ productionId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
