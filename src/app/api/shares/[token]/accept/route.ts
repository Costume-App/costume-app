import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { acceptProductionShare } from "@/lib/data/production-shares";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await getAuthContext();
    const { token } = await params;
    const { productionId } = await acceptProductionShare({ token, recipientOrgId: orgId, userId });
    return NextResponse.json({ productionId }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
