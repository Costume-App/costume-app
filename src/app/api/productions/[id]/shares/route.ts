import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { createProductionShare, listSharesForProduction } from "@/lib/data/production-shares";
import { sendEmail } from "@/lib/email";
import { shareInviteEmail } from "@/lib/share-invite-email";
import { isPaidOrg } from "@/lib/data/billing";
import { PlanLimitError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const shares = await listSharesForProduction(id);
    return NextResponse.json({ shares });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { userId, orgId } = await requireOrgAdmin();
    const { id } = await idParams(params);
    const production = await assertProductionInOrg(orgId, id);
    if (!(await isPaidOrg(orgId))) throw new PlanLimitError("needs_paid_plan");
    const body = (await request.json().catch(() => ({}))) as { recipientEmail?: string };
    const recipientEmail = typeof body.recipientEmail === "string" && body.recipientEmail.trim() ? body.recipientEmail.trim() : null;
    const share = await createProductionShare({ sourceProductionId: id, sourceOrgId: orgId, userId, recipientEmail });

    if (recipientEmail) {
      const link = `${new URL(request.url).origin}/share/${share.token}`;
      try {
        await sendEmail({ to: recipientEmail, ...shareInviteEmail(production.title, link) });
      } catch (e) {
        console.error("Share invite email failed (share still created):", e);
      }
    }
    return NextResponse.json({ share, token: share.token }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
