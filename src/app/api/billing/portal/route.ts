import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { getStripeCustomerId } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    if (!isBillingConfigured()) {
      return NextResponse.json({ error: "Billing isn't set up yet" }, { status: 503 });
    }
    const customerId = await getStripeCustomerId(orgId);
    if (!customerId) {
      return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
    }
    const origin = new URL(request.url).origin;
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/productions`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
