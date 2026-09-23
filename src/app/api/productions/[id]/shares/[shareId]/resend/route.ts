import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { getShareById } from "@/lib/data/production-shares";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { shareInviteEmail } from "@/lib/share-invite-email";

type Ctx = { params: Promise<{ id: string; shareId: string }> };

// Re-email the invite for an existing, still-pending share that has a recipient email.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id, shareId } = await idParams(params);
    const production = await assertProductionInOrg(orgId, id);
    const share = await getShareById(id, shareId);
    if (!share || share.status !== "pending" || !share.recipient_email) {
      throw new ValidationError("This link can't be re-sent.");
    }
    // sendEmail silently no-ops without a key, so guard explicitly here: the user
    // clicked "Resend" and expects to know whether it actually went out.
    if (!isEmailConfigured()) {
      throw new ValidationError("Email isn't set up yet, copy the link to share it instead.");
    }
    const link = `${new URL(request.url).origin}/share/${share.token}`;
    await sendEmail({ to: share.recipient_email, ...shareInviteEmail(production.title, link) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
