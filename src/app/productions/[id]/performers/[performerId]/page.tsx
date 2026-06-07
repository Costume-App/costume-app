import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements, listPerformers } from "@/lib/data/performers";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { MeasurementForm } from "@/components/MeasurementForm";

export default async function MeasurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; performerId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await params;
  const { from } = await searchParams;
  const backToSummary = from === "summary";
  const production = await assertProductionInOrg(orgId, id);
  await assertPerformerInOrg(orgId, performerId);

  const [definitions, measurements, performers, roles, casts, castings] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurements(performerId),
    listPerformers(id),
    listRoles(id),
    listCasts(id),
    listCastings(id),
  ]);

  const performer = performers.find((p) => p.id === performerId);
  const casting = castings.find((c) => c.performer_id === performerId);
  const role = casting ? roles.find((r) => r.id === casting.role_id) : undefined;
  const cast = casting ? casts.find((c) => c.id === casting.cast_id) : undefined;

  const initial: Record<string, number> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_numeric;

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link
        href={backToSummary ? `/productions/${id}/summary` : `/productions/${id}`}
        className="link-muted text-sm"
      >
        ← {backToSummary ? "Back" : "Cast"}
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-sm muted">
          {production.title}
          {cast ? ` · ${cast.name}` : ""}
        </p>
        <h1 className="font-display text-3xl font-semibold">{role?.name ?? "Measurements"}</h1>
        <p className="text-xl font-medium">
          {performer?.label ?? "Performer"}
          {casting?.assignment === "understudy" ? (
            <span className="muted text-base"> · Understudy</span>
          ) : null}
        </p>
      </div>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
    </main>
  );
}
