import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { addCastMember, type Assignment } from "@/lib/data/castings";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      roleId?: string;
      name?: string;
      assignment?: Assignment;
    };
    const result = await addCastMember({
      productionId: id,
      roleId: String(body.roleId ?? ""),
      name: typeof body.name === "string" ? body.name : "",
      assignment: body.assignment === "understudy" ? "understudy" : "primary",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
