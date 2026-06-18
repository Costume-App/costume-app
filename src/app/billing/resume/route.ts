import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isBillingConfigured, type CheckoutType } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/data/stripe-billing";

// Resume a checkout the visitor started from the landing (carried in a one-shot
// cookie), now that they have an org. Always clears the cookie. Any miss → app.
export async function GET(request: NextRequest) {
  const toApp = () => {
    const res = NextResponse.redirect(new URL("/productions", request.url));
    res.cookies.delete("checkout_intent");
    return res;
  };

  const plan = request.cookies.get("checkout_intent")?.value;
  if (!plan || (plan !== "unlock" && plan !== "unlimited") || !isBillingConfigured()) {
    return toApp();
  }
  try {
    const { orgId } = await auth();
    if (!orgId) return toApp();
    const url = await createCheckoutSession({
      orgId,
      type: plan as CheckoutType,
      origin: new URL(request.url).origin,
    });
    const res = NextResponse.redirect(url);
    res.cookies.delete("checkout_intent");
    return res;
  } catch (e) {
    console.error("billing resume failed:", e);
    return toApp();
  }
}
