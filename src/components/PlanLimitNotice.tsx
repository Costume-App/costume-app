"use client";

import { PlanCard } from "@/components/PlanCard";
import { PLANS } from "@/lib/billing-plans";

// Friendly subscribe-style prompt shown when an action is blocked by the org's
// plan (an HTTP 402). With a `reason`, it offers clickable plan cards; without
// one it falls back to the message + a "coming soon" note.
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
        <div className="space-y-2">
          <PlanCard
            type="seat"
            productionId={productionId}
            name={PLANS.extraSeat.label}
            price={PLANS.extraSeat.price}
            includes={PLANS.extraSeat.includes}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            includes={PLANS.unlimited.includes}
            highlight
          />
        </div>
      )}
      {(reason === "needs_paid_plan" || reason === "needs_unlock") && (
        <div className="space-y-2">
          <PlanCard
            type="unlock"
            name={PLANS.perProduction.label}
            price={PLANS.perProduction.price}
            includes={PLANS.perProduction.includes}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            includes={PLANS.unlimited.includes}
            highlight
          />
        </div>
      )}
    </div>
  );
}
