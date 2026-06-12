"use client";

import { OrganizationList } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Your organization</h1>
        <p className="mt-1 muted">
          Create a school or accept an invitation to start planning productions.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterCreateOrganizationUrl="/productions"
        afterSelectOrganizationUrl="/productions"
        appearance={clerkAppearance}
      />
    </main>
  );
}
