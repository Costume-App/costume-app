import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isBillingConfigured, type CheckoutType } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/data/stripe-billing";

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
    const url = await createCheckoutSession({
      orgId,
      type,
      productionId: body.productionId,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
