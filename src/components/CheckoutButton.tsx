"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

export function CheckoutButton({
  type,
  productionId,
  label,
  className,
}: {
  type: CheckoutType;
  productionId?: string;
  label: string;
  className?: string;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start(type, productionId)}
        className={className ?? "btn-primary"}
      >
        {busy ? "Starting…" : label}
      </button>
      {message && <p className="text-sm muted">{message}</p>}
    </>
  );
}
