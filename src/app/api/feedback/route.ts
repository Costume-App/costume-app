import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { createFeedback, type Feedback } from "@/lib/data/feedback";
import { FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/lib/feedback-types";
import { getUserEmail } from "@/lib/clerk-user";
import { sendEmail } from "@/lib/email";

function feedbackEmailBody(f: Feedback): string {
  const label = FEEDBACK_TYPE_LABELS[f.type as FeedbackType] ?? f.type;
  return [
    `Type: ${label}`,
    "",
    f.message,
    "",
    "—",
    `From: ${f.user_email ?? "unknown"}`,
    `User ID: ${f.user_id}`,
    `Org ID: ${f.org_id}`,
    `Submitted: ${f.created_at}`,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as { type?: string; message?: string };
    const userEmail = await getUserEmail(userId);
    const feedback = await createFeedback({
      orgId,
      userId,
      userEmail,
      type: String(body.type ?? ""),
      message: String(body.message ?? ""),
    });
    // Best-effort notification — the feedback is already saved, so an email
    // problem (e.g. unverified domain, no key) must not fail the request.
    try {
      await sendEmail({
        to: process.env.FEEDBACK_TO_EMAIL || "support@measuremycostume.com",
        subject: `Measure My Costume feedback: ${FEEDBACK_TYPE_LABELS[feedback.type as FeedbackType] ?? feedback.type}`,
        text: feedbackEmailBody(feedback),
      });
    } catch (e) {
      console.error("Feedback email failed (feedback still saved):", e);
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
