import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { revokeShare } from "@/lib/data/production-shares";

type Ctx = { params: Promise<{ id: string; shareId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id, shareId } = await params;
    await assertProductionInOrg(orgId, id);
    await revokeShare(id, shareId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
