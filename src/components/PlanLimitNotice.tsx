"use client";

import { CheckoutButton } from "@/components/CheckoutButton";

// Friendly subscribe-style prompt shown when an action is blocked by the org's
// plan (an HTTP 402). With a `reason`, it offers the matching checkout buttons;
// without one it falls back to the message + a "coming soon" note.
export function PlanLimitNotice({
  message,
  reason,
  productionId,
}: {
  message: string;
  reason?: "needs_unlock" | "needs_seat" | "needs_paid_plan";
  productionId?: string;
}) {
  return (
    <div className="surface space-y-2 p-3 text-sm">
      <p className="font-medium">{message}</p>
      {!reason && <p className="muted">Online checkout is coming soon.</p>}
      {reason === "needs_seat" && (
        <div className="flex flex-wrap gap-2">
          <CheckoutButton type="seat" productionId={productionId} label="Add a maker — $10" />
          <CheckoutButton type="unlimited" label="Go Unlimited — $99.99/yr" className="btn-ghost" />
        </div>
      )}
      {(reason === "needs_paid_plan" || reason === "needs_unlock") && (
        <div className="flex flex-wrap gap-2">
          <CheckoutButton type="unlock" label="Buy a production — $49.99" />
          <CheckoutButton type="unlimited" label="Go Unlimited — $99.99/yr" className="btn-ghost" />
        </div>
      )}
    </div>
  );
}
