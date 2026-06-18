import "server-only";
import { Resend } from "resend";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Sends an email via Resend when configured; no-ops (returns { sent: false })
// when RESEND_API_KEY is missing. A real send error throws so the caller can
// decide what to do (the feedback route swallows it — the feedback is already saved).
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };
  const resend = new Resend(apiKey);
  const from = process.env.FEEDBACK_FROM_EMAIL || "Measure My Costume <feedback@measuremycostume.com>";
  const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, text: input.text });
  if (error) throw new Error(error.message ?? "Email send failed");
  return { sent: true };
}
