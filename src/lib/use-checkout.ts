"use client";

import { useState } from "react";
import type { CheckoutType } from "@/lib/stripe";

// Shared checkout-start logic: POST the checkout route, redirect to Stripe, and
// surface a graceful message on a 503 (not configured) / error / network failure.
export function useCheckout() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start(type: CheckoutType, productionId?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, productionId }),
      });
      if (res.status === 503) {
        setMessage("Checkout isn't set up yet.");
        return;
      }
      if (!res.ok) {
        setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't start checkout.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setMessage("Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, start };
}
