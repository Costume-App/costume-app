import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCostumeDesigns, createCostumeDesign } from "@/lib/data/costume-designs";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const designs = await listCostumeDesigns(id);
    return NextResponse.json({ designs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { roleId?: string; name?: string };
    if (typeof body.roleId !== "string" || !body.roleId) throw new ValidationError("roleId is required");
    const design = await createCostumeDesign({
      productionId: id,
      roleId: body.roleId,
      name: typeof body.name === "string" ? body.name : "",
    });
    return NextResponse.json({ design }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
