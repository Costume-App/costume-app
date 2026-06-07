import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertRoleInProduction } from "@/lib/data/production-access";
import { deleteRoleImage } from "@/lib/data/role-images";
import { removeRoleImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; roleId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId, imageId } = await params;
    await assertProductionInOrg(orgId, id);
    await assertRoleInProduction(id, roleId);
    const path = await deleteRoleImage(roleId, imageId);
    if (path) await removeRoleImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
