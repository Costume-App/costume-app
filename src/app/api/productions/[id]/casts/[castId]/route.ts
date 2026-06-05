import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCasts, deleteCast, updateCast } from "@/lib/data/casts";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string; castId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, castId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string; color?: string };
    const cast = await updateCast(
      id,
      castId,
      typeof body.name === "string" ? body.name : "",
      typeof body.color === "string" ? body.color : undefined,
    );
    return NextResponse.json({ cast });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, castId } = await params;
    await assertProductionInOrg(orgId, id);
    const casts = await listCasts(id);
    if (casts.length <= 1) {
      throw new ValidationError("A production must have at least one cast");
    }
    await deleteCast(id, castId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
