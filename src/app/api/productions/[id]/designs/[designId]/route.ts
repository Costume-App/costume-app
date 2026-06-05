import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { updateCostumeDesign, deleteCostumeDesign } from "@/lib/data/costume-designs";

type Ctx = { params: Promise<{ id: string; designId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string };
    const design = await updateCostumeDesign(id, designId, typeof body.name === "string" ? body.name : "");
    return NextResponse.json({ design });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteCostumeDesign(id, designId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
