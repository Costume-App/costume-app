import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { createProductionShare, listSharesForProduction } from "@/lib/data/production-shares";
import { sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
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
    const { id } = await params;
    const production = await assertProductionInOrg(orgId, id);
    const body = (await request.json().catch(() => ({}))) as { recipientEmail?: string };
    const recipientEmail = typeof body.recipientEmail === "string" && body.recipientEmail.trim() ? body.recipientEmail.trim() : null;
    const share = await createProductionShare({ sourceProductionId: id, sourceOrgId: orgId, userId, recipientEmail });

    if (recipientEmail) {
      const link = `${new URL(request.url).origin}/share/${share.token}`;
      try {
        await sendEmail({
          to: recipientEmail,
          subject: `A costume production was shared with you on Measure My Costume`,
          text: `You've been invited to copy the production "${production.title}" into your organization.\n\nOpen this link, sign in, and accept:\n${link}\n\nYou'll get roles, design notes, and idea photos — performers and measurements are not included.`,
        });
      } catch (e) {
        console.error("Share invite email failed (share still created):", e);
      }
    }
    return NextResponse.json({ share, token: share.token }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
