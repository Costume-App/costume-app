import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurements, listPerformers } from "@/lib/data/performers";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { MeasurementForm } from "@/components/MeasurementForm";
import { PerformerNotes } from "@/components/PerformerNotes";

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
  // One performer can be cast in several roles/casts; they share this one set of measurements.
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));
  const appearances = castings
    .filter((c) => c.performer_id === performerId)
    .map((c) => ({
      id: c.id,
      role: roleName.get(c.role_id) ?? "Role",
      cast: casts.length > 1 ? castName.get(c.cast_id) ?? null : null,
      tag: c.assignment === "understudy" ? "Understudy" : c.assignment === "ensemble" ? "Ensemble" : null,
    }));

  const initial: Record<string, number | string> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_text ?? m.value_numeric ?? "";

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link
        href={backToSummary ? `/productions/${id}/summary` : `/productions/${id}`}
        className="link-muted text-sm"
      >
        ← {backToSummary ? "Back" : "Cast"}
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-sm muted">{production.title}</p>
        <h1 className="font-display text-3xl font-semibold">{performer?.label ?? "Measurements"}</h1>
        {appearances.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-base">
            {appearances.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.role}</span>
                <span className="muted">
                  {a.cast ? ` · ${a.cast}` : ""}
                  {a.tag ? ` · ${a.tag}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MeasurementForm performerId={performerId} definitions={definitions} initialValues={initial} />
      <PerformerNotes performerId={performerId} notes={performer?.notes ?? null} />
    </main>
  );
}
