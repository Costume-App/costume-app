"use client";

import { OrganizationList } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export function OnboardingCreate() {
  return (
    <OrganizationList
      hidePersonal
      afterCreateOrganizationUrl="/productions"
      afterSelectOrganizationUrl="/productions"
      appearance={clerkAppearance}
    />
  );
}
