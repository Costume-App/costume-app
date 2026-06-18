import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripe, PRICE_IDS, type CheckoutType } from "@/lib/stripe";
import { ensureOrgRow } from "@/lib/data/organizations";

// Period end lives on the subscription item in Stripe API 2026-05-27.dahlia
// (it was removed from the Subscription object itself).
export function subscriptionPeriodEndIso(sub: Stripe.Subscription): string {
  return new Date(sub.items.data[0].current_period_end * 1000).toISOString();
}

export async function getStripeCustomerId(orgId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
}

// Reuse the org's Stripe customer, or create one and store its id WITHOUT
// touching comped/status (so a comped org stays comped).
export async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const existing = await getStripeCustomerId(orgId);
  if (existing) return existing;
  // org_subscriptions FKs to organizations(clerk_org_id); a brand-new org that
  // hasn't created a production yet has no row, which would FK-violate the
  // billing write below. Ensure it first.
  await ensureOrgRow(orgId);
  const customer = await getStripe().customers.create({ metadata: { orgId } });
  const { error } = await supabaseAdmin
    .from("org_subscriptions")
    .upsert(
      { org_id: orgId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) throw new Error(error.message);
  return customer.id;
}

// Idempotently grant the entitlement a completed Checkout session paid for.
// Safe to call from both the webhook and the return page (dedup on session id).
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const orgId = session.metadata?.orgId;
  const type = session.metadata?.type;
  if (!orgId || !type) throw new Error("Checkout session missing orgId/type metadata");

  if (type === "unlock") {
    const { error } = await supabaseAdmin
      .from("production_purchases")
      .upsert(
        { org_id: orgId, stripe_session_id: session.id, source: "stripe" },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return;
  }
  if (type === "seat") {
    const productionId = session.metadata?.productionId;
    if (!productionId) throw new Error("Seat checkout session missing productionId");
    const { error } = await supabaseAdmin
      .from("seat_purchases")
      .upsert(
        { org_id: orgId, production_id: productionId, stripe_session_id: session.id, source: "stripe" },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return;
  }
  if (type === "unlimited") {
    const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
    const { error } = await supabaseAdmin.from("org_subscriptions").upsert(
      {
        org_id: orgId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        status: sub.status,
        current_period_end: subscriptionPeriodEndIso(sub),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error(`Unknown checkout type: ${type}`);
}

// Single source of truth for building a Stripe Checkout session. Used by the
// checkout route and by /billing/resume.
export async function createCheckoutSession(input: {
  orgId: string;
  type: CheckoutType;
  productionId?: string;
  origin: string;
}): Promise<string> {
  const { orgId, type, productionId, origin } = input;
  const customer = await getOrCreateStripeCustomer(orgId);
  const session = await getStripe().checkout.sessions.create({
    mode: type === "unlimited" ? "subscription" : "payment",
    customer,
    line_items: [{ price: PRICE_IDS[type], quantity: 1 }],
    metadata: { orgId, type, ...(productionId ? { productionId } : {}) },
    ...(type === "unlimited" ? { subscription_data: { metadata: { orgId } } } : {}),
    success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/productions`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

// Keep org_subscriptions in sync with subscription lifecycle + renewal events.
export async function applySubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const update = {
    status: subscription.status,
    current_period_end: subscriptionPeriodEndIso(subscription),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id)
    .select("org_id");
  if (error) throw new Error(error.message);
  if ((!data || (data as unknown[]).length === 0) && subscription.metadata?.orgId) {
    const { error: upErr } = await supabaseAdmin.from("org_subscriptions").upsert(
      { org_id: subscription.metadata.orgId, stripe_subscription_id: subscription.id, ...update },
      { onConflict: "org_id" },
    );
    if (upErr) throw new Error(upErr.message);
  }
}
