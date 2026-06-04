export type GuardDecision = { type: "allow" } | { type: "redirect"; to: string };

// Decides where a *signed-in* request should go based on whether the user has an
// active organization. Sign-in enforcement happens separately in middleware; this
// only handles the org gate so it stays pure and testable.
export function orgGate({
  isOnboarding,
  orgId,
}: {
  isOnboarding: boolean;
  orgId: string | null;
}): GuardDecision {
  if (!orgId) {
    // No active org: must create/select one before using the app.
    return isOnboarding ? { type: "allow" } : { type: "redirect", to: "/onboarding" };
  }
  if (isOnboarding) {
    // Already has an org — no reason to sit on onboarding.
    return { type: "redirect", to: "/productions" };
  }
  return { type: "allow" };
}
