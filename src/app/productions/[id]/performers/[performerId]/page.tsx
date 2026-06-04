import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements } from "@/lib/data/performers";
import { MeasurementForm } from "@/components/MeasurementForm";

export default async function MeasurementPage({
  params,
}: {
  params: Promise<{ id: string; performerId: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await params;
  await assertProductionInOrg(orgId, id);

  const [definitions, measurements] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurements(performerId),
  ]);

  const initial: Record<string, number> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_numeric;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href={`/productions/${id}`} className="text-sm text-gray-500 hover:underline">
        ← Cast
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Measurements</h1>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
    </main>
  );
}
