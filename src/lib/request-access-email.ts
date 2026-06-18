// Subject + plain-text body for the "someone asked to join your org" admin email.
export function requestAccessEmail(
  requesterName: string,
  requesterEmail: string,
  orgName: string,
): { subject: string; text: string } {
  return {
    subject: `${requesterName} asked to join ${orgName} on Measure My Costume`,
    text:
      `${requesterName} (${requesterEmail}) asked to join your organization "${orgName}" on Measure My Costume.\n\n` +
      `To add them: open Measure My Costume, go to your organization → Members, and invite ${requesterEmail}.`,
  };
}
