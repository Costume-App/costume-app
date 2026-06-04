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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productions</h1>
        <Link
          href="/productions/new"
          className="rounded-lg bg-black px-4 py-2 font-medium text-white"
        >
          + New Production
        </Link>
      </div>

      {productions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          No productions yet. Create your first show to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {productions.map((p) => (
            <li key={p.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">{p.title}</span>
                <div className="flex items-center gap-2">
                  {p.show_date && (
                    <span className="text-sm text-gray-600">{formatShowDate(p.show_date)}</span>
                  )}
                  <CountdownBadge showDate={p.show_date} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
