import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles, createRole } from "@/lib/data/roles";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const roles = await listRoles(id);
    return NextResponse.json({ roles });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string };
    const role = await createRole({ productionId: id, name: typeof body.name === "string" ? body.name : "" });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
