import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listProductions } from "@/lib/data/productions";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";

export default async function ProductionsPage() {
  const { orgId } = await getAuthContext();
  const productions = await listProductions(orgId);

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
        <ul className="space-y-3">
          {productions.map((p) => (
            <li key={p.id} className="surface transition-transform hover:-translate-y-0.5">
              <Link href={`/productions/${p.id}`} className="block p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-xl font-semibold">{p.title}</span>
                  <div className="flex items-center gap-2">
                    {p.show_date && <span className="text-sm muted">{formatShowDate(p.show_date)}</span>}
                    <CountdownBadge showDate={p.show_date} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
