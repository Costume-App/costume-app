import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listProductions } from "@/lib/data/productions";
import { CountdownBadge } from "@/components/CountdownBadge";

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
                <CountdownBadge showDate={p.show_date} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
