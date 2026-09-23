import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { addShowDate } from "@/lib/data/show-dates";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { date?: string; time?: string; label?: string };
    const showDate = await addShowDate(
      id,
      typeof body.date === "string" ? body.date : "",
      typeof body.time === "string" ? body.time : null,
      typeof body.label === "string" ? body.label : null,
    );
    return NextResponse.json({ showDate }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
