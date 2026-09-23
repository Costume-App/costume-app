import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isAiConfigured, suggestRolesForTitle } from "@/lib/ai/suggest-roles";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    const production = await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "AI suggestions are not configured." }, { status: 501 });
    }
    const roles = await suggestRolesForTitle(production.title);
    return NextResponse.json({ title: production.title, roles });
  } catch (err) {
    return errorResponse(err);
  }
}
