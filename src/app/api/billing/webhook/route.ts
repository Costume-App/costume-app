import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { fulfillCheckoutSession, applySubscriptionEvent } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up" }, { status: 503 });
  }
  const sig = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
        if (invoice.subscription) {
          const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
          await applySubscriptionEvent(sub);
        }
        break;
      }
      default:
        break; // ignore other event types
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", event.type, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
