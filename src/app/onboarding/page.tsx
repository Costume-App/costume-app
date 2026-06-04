"use client";

import { CreateOrganization } from "@clerk/nextjs";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Create your school</h1>
        <p className="mt-1 text-gray-600">
          Set up an organization to start planning productions.
        </p>
      </div>
      <CreateOrganization afterCreateOrganizationUrl="/productions" skipInvitationScreen />
    </main>
  );
}
