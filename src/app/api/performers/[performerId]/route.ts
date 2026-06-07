import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { deletePerformer, updatePerformer } from "@/lib/data/performers";
import { assertPerformerInOrg } from "@/lib/data/production-access";

type Ctx = { params: Promise<{ performerId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    await deletePerformer(performerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    const body = (await request.json()) as { label?: string };
    const performer = await updatePerformer(performerId, typeof body.label === "string" ? body.label : "");
    return NextResponse.json({ performer });
  } catch (err) {
    return errorResponse(err);
  }
}
