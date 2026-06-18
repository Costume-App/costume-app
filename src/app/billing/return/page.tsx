import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { isBillingConfigured, getStripe } from "@/lib/stripe";
import { fulfillCheckoutSession } from "@/lib/data/stripe-billing";

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { session_id } = await searchParams;

  if (isBillingConfigured() && session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      const paid = session.payment_status === "paid" || session.status === "complete";
      if (paid && session.metadata?.orgId === orgId) {
        await fulfillCheckoutSession(session);
      }
    } catch (err) {
      // The webhook is the source of truth; if this best-effort verify fails, it still lands.
      console.error("Return-page fulfillment failed (webhook will cover it):", err);
    }
  }
  redirect("/productions");
}
