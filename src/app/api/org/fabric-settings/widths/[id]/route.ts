import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { updateFabricWidth, deleteFabricWidth } from "@/lib/data/fabric-settings";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await idParams(params);
    const body = (await request.json()) as { value?: string; isDefault?: boolean };
    const patch: { value?: string; isDefault?: boolean } = {};
    if (typeof body.value === "string") patch.value = body.value;
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    const width = await updateFabricWidth(orgId, id, patch);
    return NextResponse.json({ width });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await idParams(params);
    await deleteFabricWidth(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
