// Subject + plain-text body for the "a production was shared with you" invite email.
// Shared by the share-create route and the resend route so the wording stays in one place.
export function shareInviteEmail(productionTitle: string, link: string): { subject: string; text: string } {
  return {
    subject: "A costume production was shared with you on Measure My Costume",
    text:
      `You've been invited to copy the production "${productionTitle}" into your organization.\n\n` +
      `Open this link, sign in, and accept:\n${link}\n\n` +
      `You'll get roles, design notes, and idea photos — performers and measurements are not included.`,
  };
}
