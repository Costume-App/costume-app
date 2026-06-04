import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listPerformers } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { PerformerList } from "@/components/PerformerList";

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id } = await params;

  let production;
  try {
    production = await assertProductionInOrg(orgId, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const performers = await listPerformers(id);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="text-sm text-gray-500 hover:underline">
        ← Productions
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{production.title}</h1>
        <div className="flex items-center gap-2">
          {production.show_date && (
            <span className="text-sm text-gray-600">{formatShowDate(production.show_date)}</span>
          )}
          <CountdownBadge showDate={production.show_date} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cast</h2>
        <PerformerList productionId={id} initialPerformers={performers} />
      </section>
    </main>
  );
}
