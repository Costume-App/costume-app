"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

// A landing-style price card (Fraunces name, big price, ✦ points) whose CTA
// button starts Stripe Checkout. Mirrors the pricing cards in LandingPage.
export function PlanCard({
  type,
  productionId,
  name,
  price,
  cadence,
  points,
  highlight,
}: {
  type: CheckoutType;
  productionId?: string;
  name: string;
  price: string;
  cadence: string;
  points: readonly string[];
  highlight?: boolean;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <div className="flex h-full flex-col space-y-1">
      <article
        className={`surface flex flex-1 flex-col p-5 ${highlight ? "ring-2 ring-[var(--red)]" : ""}`}
      >
        {highlight && <span className="lbl mb-2 inline-block text-[var(--red)]">Best value</span>}
        <h3 className="font-display text-xl font-semibold">{name}</h3>
        <p className="mt-2">
          <span className="font-display text-3xl font-semibold">{price}</span>{" "}
          <span className="text-sm muted">{cadence}</span>
        </p>
        <ul className="mt-3 flex-1 space-y-1.5 text-sm">
          {points.map((pt) => (
            <li key={pt} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-[var(--red)]">✦</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => void start(type, productionId)}
          className={`mt-4 w-full text-center ${highlight ? "btn-primary" : "btn-ghost"} disabled:opacity-60`}
        >
          {busy ? "Starting…" : "Choose →"}
        </button>
      </article>
      {message && <p className="text-sm muted">{message}</p>}
    </div>
  );
}
