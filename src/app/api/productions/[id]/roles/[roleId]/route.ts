import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteRole, setRoleNotes, updateRole, setRoleEnsemble } from "@/lib/data/roles";

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

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string; notes?: string; isEnsemble?: boolean };
    if (typeof body.isEnsemble === "boolean") {
      const role = await setRoleEnsemble(id, roleId, body.isEnsemble);
      return NextResponse.json({ role });
    }
    if (typeof body.name === "string") {
      const role = await updateRole(id, roleId, body.name);
      return NextResponse.json({ role });
    }
    const role = await setRoleNotes(id, roleId, typeof body.notes === "string" ? body.notes : "");
    return NextResponse.json({ role });
  } catch (err) {
    return errorResponse(err);
  }
}
