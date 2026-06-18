import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isBillingConfigured } from "@/lib/stripe";
import { isUnlimited, isPaidOrg } from "@/lib/data/billing";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const [unlimited, paid] = await Promise.all([isUnlimited(orgId), isPaidOrg(orgId)]);
    const { data } = await supabaseAdmin
      .from("org_subscriptions")
      .select("status, stripe_customer_id")
      .eq("org_id", orgId)
      .maybeSingle();
    const row = data as { status: string | null; stripe_customer_id: string | null } | null;
    return NextResponse.json({
      isUnlimited: unlimited,
      isPaidOrg: paid,
      subscriptionStatus: row?.status ?? null,
      hasStripeCustomer: Boolean(row?.stripe_customer_id),
      billingConfigured: isBillingConfigured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
