import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { addCastMember, listCastings } from "@/lib/data/castings";
import { isAssignment } from "@/lib/casting-assignment";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const castings = await listCastings(id);
    return NextResponse.json({ castings });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      castId?: string;
      roleId?: string;
      name?: string;
      performerId?: string;
      assignment?: string;
    };
    const castId = String(body.castId ?? "");
    const roleId = String(body.roleId ?? "");

    const [roles, casts] = await Promise.all([listRoles(id), listCasts(id)]);
    const role = roles.find((r) => r.id === roleId);
    if (!role) throw new NotFoundError("Role not found");
    if (!casts.some((c) => c.id === castId)) throw new NotFoundError("Cast not found");

    const who =
      typeof body.performerId === "string" && body.performerId
        ? { performerId: body.performerId }
        : { name: typeof body.name === "string" ? body.name : "" };

    const result = await addCastMember({
      productionId: id,
      castId,
      roleId,
      roleIsEnsemble: role.is_ensemble,
      assignment: isAssignment(body.assignment) ? body.assignment : role.is_ensemble ? "ensemble" : "primary",
      ...who,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
