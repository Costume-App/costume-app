import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg, assertRoleInProduction } from "@/lib/data/production-access";
import { deleteRole, setRoleNotes, updateRole, setRoleEnsemble } from "@/lib/data/roles";
import { listRoleImagePaths } from "@/lib/data/storage-paths";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertRoleInProduction(id, roleId); // assert ownership before touching storage
    await removeImages(await listRoleImagePaths(roleId));
    await deleteRole(id, roleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await idParams(params);
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
    if (typeof body.notes === "string") {
      const role = await setRoleNotes(id, roleId, body.notes);
      return NextResponse.json({ role });
    }
    // Never fall through to clearing notes on a malformed body (e.g. isEnsemble: "yes").
    throw new ValidationError("Nothing to update");
  } catch (err) {
    return errorResponse(err);
  }
}
