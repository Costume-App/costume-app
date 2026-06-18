import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { canCreateProduction } from "@/lib/data/billing";
import { PLANS } from "@/lib/billing-plans";
import { NewProductionForm } from "@/components/NewProductionForm";

export default async function NewProductionPage() {
  const { orgId } = await getAuthContext();
  const gate = await canCreateProduction(orgId);

  // No active plan / no unused unlock: show the subscribe prompt instead of the
  // form. The POST /api/productions route enforces the same limit server-side,
  // so a direct submit still can't bypass this.
  if (!gate.allowed) {
    const plans = [PLANS.perProduction, PLANS.unlimited];
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="font-display mb-3 text-3xl font-semibold">Subscribe to add a production</h1>
        <p className="muted mb-4">
          Your current plan doesn&rsquo;t include another production. Choose a plan to add one:
        </p>
        <ul className="mb-4 space-y-2">
          {plans.map((plan) => (
            <li key={plan.id} className="surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{plan.label}</span>
                <span className="text-sm muted">{plan.price}</span>
              </div>
              <span className="text-sm muted">{plan.includes}</span>
            </li>
          ))}
        </ul>
        <p className="muted mb-4 text-sm">Online checkout is coming soon.</p>
        <div className="flex gap-3">
          <button type="button" disabled className="btn-primary flex-1 opacity-60">
            Subscribe — coming soon
          </button>
          <Link href="/productions" className="btn-ghost">
            Back
          </Link>
        </div>
      </main>
    );
  }

  return <NewProductionForm />;
}
