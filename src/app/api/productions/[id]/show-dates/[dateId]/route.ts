import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteShowDate, updateShowDate } from "@/lib/data/show-dates";

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

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, dateId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { date?: string; time?: string; label?: string };
    const patch: { show_date?: string; show_time?: string | null; label?: string | null } = {};
    if (typeof body.date === "string") patch.show_date = body.date;
    if (typeof body.time === "string") patch.show_time = body.time;
    if (typeof body.label === "string") patch.label = body.label;
    const showDate = await updateShowDate(id, dateId, patch);
    return NextResponse.json({ showDate });
  } catch (err) {
    return errorResponse(err);
  }
}
