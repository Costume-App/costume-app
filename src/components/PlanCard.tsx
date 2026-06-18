"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

// A clickable price card: the whole card is the buy action (→ Stripe Checkout).
export function PlanCard({
  type,
  productionId,
  name,
  price,
  includes,
  highlight,
}: {
  type: CheckoutType;
  productionId?: string;
  name: string;
  price: string;
  includes: string;
  highlight?: boolean;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start(type, productionId)}
        className={`surface block w-full p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
          highlight ? "ring-2 ring-[var(--red)]" : ""
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{name}</span>
          <span className="text-sm muted">{price}</span>
        </div>
        <span className="text-sm muted">{includes}</span>
        <span className="link-red mt-2 block text-sm">{busy ? "Starting…" : "Choose →"}</span>
      </button>
      {message && <p className="text-sm muted">{message}</p>}
    </div>
  );
}
