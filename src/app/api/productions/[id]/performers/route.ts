import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listPerformers, createPerformer } from "@/lib/data/performers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const performers = await listPerformers(id);
    return NextResponse.json({ performers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { label?: string };
    const performer = await createPerformer({
      productionId: id,
      label: typeof body.label === "string" ? body.label : "",
    });
    return NextResponse.json({ performer }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
