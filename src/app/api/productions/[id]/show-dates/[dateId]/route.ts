import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteShowDate } from "@/lib/data/show-dates";

type Ctx = { params: Promise<{ id: string; dateId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, dateId } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteShowDate(id, dateId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
