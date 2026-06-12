import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { todayIso } from "@/lib/countdown";
import { NotFoundError } from "@/lib/errors";
import { TailorSummary } from "@/components/TailorSummary";
import { isAiConfigured } from "@/lib/ai/estimate-fabric";

export default async function TailorSummaryPage({
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

  const data = await loadCostumeCreationsData(orgId, production);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/productions/${id}`} className="link-muted text-sm">
        ← {production.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold">Costume Creations</h1>
      <TailorSummary {...data} today={todayIso()} aiConfigured={isAiConfigured()} />
    </main>
  );
}
