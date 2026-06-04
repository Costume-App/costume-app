import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { addCastMember, type Assignment } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      castId?: string;
      roleId?: string;
      name?: string;
      assignment?: Assignment;
    };
    const castId = String(body.castId ?? "");
    const roleId = String(body.roleId ?? "");

    const [roles, casts] = await Promise.all([listRoles(id), listCasts(id)]);
    if (!roles.some((r) => r.id === roleId)) throw new NotFoundError("Role not found");
    if (!casts.some((c) => c.id === castId)) throw new NotFoundError("Cast not found");

    const result = await addCastMember({
      productionId: id,
      castId,
      roleId,
      name: typeof body.name === "string" ? body.name : "",
      assignment: body.assignment === "understudy" ? "understudy" : "primary",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
