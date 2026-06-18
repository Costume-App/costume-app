import "server-only";
import Stripe from "stripe";

export type CheckoutType = "unlock" | "seat" | "unlimited";

export const PRICE_IDS = {
  unlock: process.env.STRIPE_PRICE_UNLOCK ?? "",
  seat: process.env.STRIPE_PRICE_SEAT ?? "",
  unlimited: process.env.STRIPE_PRICE_UNLIMITED ?? "",
} as const;

// True only when every Stripe var is present. Routes gate on this and 503 when
// false; the UI degrades to "checkout isn't set up yet."
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      PRICE_IDS.unlock &&
      PRICE_IDS.seat &&
      PRICE_IDS.unlimited,
  );
}

let client: Stripe | null = null;
// Lazily construct + memoize the SDK client. Callers must check isBillingConfigured first.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(key);
  return client;
}
