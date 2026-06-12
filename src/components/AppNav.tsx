import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { OrgSwitcher } from "@/components/OrgSwitcher";

export async function AppNav() {
  const user = await currentUser();
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
          <Link href="/my-work" className="link-muted text-sm">
            My Work
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          {userName && <span className="hidden text-sm muted sm:inline">{userName}</span>}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
