"use client";

import { OrganizationSwitcher } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { MakersTabIcon, OrgMakersPanel } from "@/components/OrgMakersPanel";

export function OrgSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterSelectOrganizationUrl="/productions"
      afterCreateOrganizationUrl="/productions"
      appearance={clerkAppearance}
    >
      <OrganizationSwitcher.OrganizationProfilePage label="Makers" labelIcon={<MakersTabIcon />} url="makers">
        <OrgMakersPanel />
      </OrganizationSwitcher.OrganizationProfilePage>
    </OrganizationSwitcher>
  );
}
