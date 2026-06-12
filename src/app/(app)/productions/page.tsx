import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listProductions } from "@/lib/data/productions";
import { listInventoryItems } from "@/lib/data/inventory-items";
import { listShowDates } from "@/lib/data/show-dates";
import { CountdownBadge } from "@/components/CountdownBadge";
import { PastAndInactiveProductions } from "@/components/PastAndInactiveProductions";
import { InventoryQuickAddCard } from "@/components/InventoryQuickAddCard";
import { ShowingsList } from "@/components/ShowingsList";
import { nextUpcomingDate, todayIso } from "@/lib/countdown";
import { partitionProductions } from "@/lib/production-status";

export default async function ProductionsPage() {
  const { orgId } = await getAuthContext();
  const [productions, inventoryItems] = await Promise.all([
    listProductions(orgId),
    listInventoryItems(orgId),
  ]);

  const allShowDates = await listShowDates(productions.map((p) => p.id));
  const today = todayIso();
  const withDates = productions.map((p) => {
    const showings = allShowDates.filter((d) => d.production_id === p.id);
    return { ...p, dates: showings.map((s) => s.show_date), showings };
  });
  const { active, inactive } = partitionProductions(withDates, today);
  const pastAndInactive = inactive.map((p) => ({
    id: p.id,
    title: p.title,
    showings: p.showings.map((s) => ({ id: s.id, show_date: s.show_date, show_time: s.show_time, label: s.label })),
  }));

  return (
    <main className="mx-auto max-w-2xl p-6">
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
              {active.map((p) => (
                <li key={p.id} className="surface transition-transform hover:-translate-y-0.5">
                  <Link href={`/productions/${p.id}`} className="block p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-xl font-semibold">{p.title}</span>
                      <CountdownBadge showDate={nextUpcomingDate(p.dates, today)} />
                    </div>
                    {p.showings.length > 0 && (
                      <div className="mt-2">
                        <ShowingsList showings={p.showings} />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <PastAndInactiveProductions productions={pastAndInactive} />
        </>
      )}

      <InventoryQuickAddCard itemCount={inventoryItems.length} />
    </main>
  );
}
