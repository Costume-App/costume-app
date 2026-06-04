import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements, listPerformers } from "@/lib/data/performers";
import { listRoles } from "@/lib/data/roles";
import { listCastings } from "@/lib/data/castings";
import { MeasurementForm } from "@/components/MeasurementForm";

export default async function MeasurementPage({
  params,
}: {
  params: Promise<{ id: string; performerId: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await params;
  const production = await assertProductionInOrg(orgId, id);
  await assertPerformerInOrg(orgId, performerId);

  const [definitions, measurements, performers, roles, castings] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurements(performerId),
    listPerformers(id),
    listRoles(id),
    listCastings(id),
  ]);

  const performer = performers.find((p) => p.id === performerId);
  const casting = castings.find((c) => c.performer_id === performerId);
  const role = casting ? roles.find((r) => r.id === casting.role_id) : undefined;

  const initial: Record<string, number> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_numeric;

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href={`/productions/${id}`} className="text-sm text-gray-500 hover:underline">
        ← Cast
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-sm text-gray-500">{production.title}</p>
        <h1 className="text-2xl font-bold">{role?.name ?? "Measurements"}</h1>
        <p className="text-gray-600">
          {performer?.label ?? "Performer"}
          {casting?.assignment === "understudy" ? " · Understudy" : ""}
        </p>
      </div>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
    </main>
  );
}
