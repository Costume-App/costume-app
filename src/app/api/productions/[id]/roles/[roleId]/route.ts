import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteRole } from "@/lib/data/roles";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteRole(id, roleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
