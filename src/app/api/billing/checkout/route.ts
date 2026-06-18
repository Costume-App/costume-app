import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isBillingConfigured, getStripe, PRICE_IDS, type CheckoutType } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    if (!isBillingConfigured()) {
      return NextResponse.json({ error: "Billing isn't set up yet" }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as { type?: string; productionId?: string };
    const type = body.type as CheckoutType;
    if (type !== "unlock" && type !== "seat" && type !== "unlimited") {
      throw new ValidationError("Invalid checkout type");
    }
    if (type === "seat") {
      if (!body.productionId) throw new ValidationError("productionId is required for a seat");
      await assertProductionInOrg(orgId, body.productionId);
    }
    const customer = await getOrCreateStripeCustomer(orgId);
    const origin = new URL(request.url).origin;
    const session = await getStripe().checkout.sessions.create({
      mode: type === "unlimited" ? "subscription" : "payment",
      customer,
      line_items: [{ price: PRICE_IDS[type], quantity: 1 }],
      metadata: { orgId, type, ...(body.productionId ? { productionId: body.productionId } : {}) },
      ...(type === "unlimited" ? { subscription_data: { metadata: { orgId } } } : {}),
      success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/productions`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
