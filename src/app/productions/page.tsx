import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { getAuthContext } from "@/lib/auth-context";
import { listProductions } from "@/lib/data/productions";
import { listShowDates } from "@/lib/data/show-dates";
import { CountdownBadge } from "@/components/CountdownBadge";
import { PastAndInactiveProductions } from "@/components/PastAndInactiveProductions";
import { formatShowDate, nextUpcomingDate, latestDate, todayIso } from "@/lib/countdown";
import { partitionProductions } from "@/lib/production-status";

export default async function ProductionsPage() {
  const { orgId } = await getAuthContext();
  const [productions, user, org] = await Promise.all([
    listProductions(orgId),
    currentUser(),
    clerkClient().then((c) => c.organizations.getOrganization({ organizationId: orgId })),
  ]);

  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const allShowDates = await listShowDates(productions.map((p) => p.id));
  const today = todayIso();
  const withDates = productions.map((p) => ({
    ...p,
    dates: allShowDates.filter((d) => d.production_id === p.id).map((d) => d.show_date),
  }));
  const { active, inactive } = partitionProductions(withDates, today);
  const pastAndInactive = inactive.map((p) => ({
    id: p.id,
    title: p.title,
    displayDate: nextUpcomingDate(p.dates, today) ?? latestDate(p.dates),
  }));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--field-line)] pb-3">
        <span className="lbl">{org.name}</span>
        <div className="flex items-center gap-2.5">
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Productions</h1>
        <Link href="/productions/new" className="btn-primary shrink-0 text-sm">
          + New Production
        </Link>
      </div>

      {productions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          No productions yet. Create your first show to get started.
        </p>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="space-y-3">
              {active.map((p) => {
                const next = nextUpcomingDate(p.dates, today);
                return (
                  <li key={p.id} className="surface transition-transform hover:-translate-y-0.5">
                    <Link href={`/productions/${p.id}`} className="block p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-display text-xl font-semibold">{p.title}</span>
                        <div className="flex items-center gap-2">
                          {next && <span className="text-sm muted">{formatShowDate(next)}</span>}
                          <CountdownBadge showDate={next} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <PastAndInactiveProductions productions={pastAndInactive} />
        </>
      )}
    </main>
  );
}
