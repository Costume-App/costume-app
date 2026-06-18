import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser, auth } from "@clerk/nextjs/server";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { recordOrgDomain } from "@/lib/data/org-domains";
import { ensureOrgRow } from "@/lib/data/organizations";

export async function AppNav() {
  const user = await currentUser();
  const { orgId } = await auth();
  const primaryEmail = user?.emailAddresses?.[0]?.emailAddress;
  if (orgId) {
    // Ensure the organizations row exists (other tables FK to it), then lazily
    // backfill the org→domain map. Best-effort; never let it break the nav.
    try {
      await ensureOrgRow(orgId);
      if (primaryEmail) await recordOrgDomain(orgId, primaryEmail);
    } catch (e) {
      console.error("org backfill failed (non-fatal):", e);
    }
  }
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  return (
    <header className="mx-auto max-w-2xl px-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--field-line)] pb-3">
        <OrgSwitcher />
        <div className="flex items-center gap-2.5">
          <Link href="/productions" className="link-muted text-sm">
            Productions
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          <Link href="/my-work" className="link-muted text-sm">
            My Work
          </Link>
          {userName && <span className="hidden text-sm muted sm:inline">{userName}</span>}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
