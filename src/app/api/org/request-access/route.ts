import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { errorResponse } from "@/lib/api";
import { emailDomain } from "@/lib/email-domains";
import { findOrgsByDomain } from "@/lib/data/org-domains";
import { listOrgAdmins } from "@/lib/data/org-members";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { requestAccessEmail } from "@/lib/request-access-email";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { orgId?: string };
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
    const domain = email ? emailDomain(email) : null;

    // Re-verify server-side: the requester's verified domain must actually map to
    // this org (also rejects public domains, since findOrgsByDomain returns []).
    const matches = domain ? await findOrgsByDomain(domain) : [];
    const match = matches.find((m) => m.orgId === orgId);
    if (!match || !email) {
      return NextResponse.json({ error: "Can't request access to that organization" }, { status: 403 });
    }

    if (!isEmailConfigured()) return NextResponse.json({ sent: false });

    const requesterName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email;
    const tmpl = requestAccessEmail(requesterName, email, match.name);
    const admins = await listOrgAdmins(orgId);
    let sent = false;
    for (const admin of admins) {
      try {
        const r = await sendEmail({ to: admin.email, ...tmpl });
        if (r.sent) sent = true;
      } catch (e) {
        console.error("request-access admin email failed:", e);
      }
    }
    return NextResponse.json({ sent });
  } catch (err) {
    return errorResponse(err);
  }
}
