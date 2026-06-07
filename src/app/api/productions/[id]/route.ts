import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteProduction } from "@/lib/data/productions";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteProduction(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
