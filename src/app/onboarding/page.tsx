import { currentUser } from "@clerk/nextjs/server";
import { emailDomain } from "@/lib/email-domains";
import { findOrgsByDomain } from "@/lib/data/org-domains";
import { OnboardingCreate } from "@/components/OnboardingCreate";
import { RequestToJoin } from "@/components/RequestToJoin";

export default async function OnboardingPage() {
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const domain = email ? emailDomain(email) : null;
  const matches = domain ? await findOrgsByDomain(domain) : [];
  const match = matches.length === 1 ? matches[0] : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Your organization</h1>
        <p className="mt-1 muted">
          {match
            ? "Join your organization, or create a new one."
            : "Create a school or accept an invitation to start planning productions."}
        </p>
      </div>

      {match ? (
        <>
          <RequestToJoin orgId={match.orgId} orgName={match.name} domain={domain!} />
          <details className="text-sm">
            <summary className="cursor-pointer link-muted">Create a different organization instead</summary>
            <div className="mt-4">
              <OnboardingCreate />
            </div>
          </details>
        </>
      ) : (
        <OnboardingCreate />
      )}
    </main>
  );
}
