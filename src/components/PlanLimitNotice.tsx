"use client";

// Friendly subscribe-style prompt shown when an action is blocked by the org's
// plan (an HTTP 402 from the API). The message text comes from the server
// (PlanLimitError); online checkout itself isn't built yet (pricing Phase 2).
export function PlanLimitNotice({ message }: { message: string }) {
  return (
    <div className="surface space-y-1 p-3 text-sm">
      <p className="font-medium">{message}</p>
      <p className="muted">Online checkout is coming soon.</p>
    </div>
  );
}
