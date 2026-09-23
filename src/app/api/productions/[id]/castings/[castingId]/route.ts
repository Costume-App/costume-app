import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { removeCasting } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string; castingId: string }> };

// Unassign one casting. removeCasting scopes its lookup to the production, so a casting from
// another production 404s; the performer is deleted only if this was their last casting.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, castingId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const { performerDeleted } = await removeCasting(id, castingId);
    return NextResponse.json({ ok: true, performerDeleted });
  } catch (err) {
    return errorResponse(err);
  }
}
