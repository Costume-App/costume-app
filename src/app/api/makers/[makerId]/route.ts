import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { updateMaker, deleteMaker } from "@/lib/data/makers";

type Ctx = { params: Promise<{ makerId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { makerId } = await idParams(params);
    const body = (await request.json()) as { name?: string; color?: string; clerkUserId?: string | null };
    const patch: { name?: string; color?: string; clerkUserId?: string | null } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.color === "string") patch.color = body.color;
    if (body.clerkUserId === null || typeof body.clerkUserId === "string") patch.clerkUserId = body.clerkUserId;
    const maker = await updateMaker(orgId, makerId, patch);
    return NextResponse.json({ maker });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { makerId } = await idParams(params);
    await deleteMaker(orgId, makerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
