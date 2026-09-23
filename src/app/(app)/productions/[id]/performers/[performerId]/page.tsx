import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";
import { NotFoundError } from "@/lib/errors";
import { pageIdParams } from "@/lib/route-params";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { getMeasurementsForPerformers, listPerformers } from "@/lib/data/performers";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { MeasurementForm } from "@/components/MeasurementForm";
import { PerformerNotes } from "@/components/PerformerNotes";
import { PerformerSwitcher } from "@/components/PerformerSwitcher";
import { PendingSavesProvider } from "@/components/PendingSaves";

export default async function MeasurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; performerId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id, performerId } = await pageIdParams(params);
  const { from } = await searchParams;
  const backToSummary = from === "summary";
  let production;
  try {
    production = await assertProductionInOrg(orgId, id);
    await assertPerformerInOrg(orgId, performerId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [definitions, performers, roles, casts, castings] = await Promise.all([
    listMeasurementDefinitions(),
    listPerformers(id),
    listRoles(id),
    listCasts(id),
    listCastings(id),
  ]);
  // Everyone's rows at once: this performer's values, plus the filled counts the switcher shows.
  const allMeasurements = await getMeasurementsForPerformers(performers.map((p) => p.id));
  const measurements = allMeasurements.filter((m) => m.performer_id === performerId);
  const definitionKeys = new Set(definitions.map((d) => d.key));
  const filled = new Map<string, number>();
  for (const m of allMeasurements) {
    if (!definitionKeys.has(m.measurement_key)) continue;
    if (m.value_numeric == null && (m.value_text ?? "").trim() === "") continue;
    filled.set(m.performer_id, (filled.get(m.performer_id) ?? 0) + 1);
  }
  // Performer ids down the Cast tab: roles in order, each role's castings in cast order.
  const castRank = new Map(casts.map((c, i) => [c.id, i]));
  const roleOrder = roles.flatMap((r) =>
    castings
      .filter((c) => c.role_id === r.id)
      .sort((a, b) => (castRank.get(a.cast_id) ?? 0) - (castRank.get(b.cast_id) ?? 0))
      .map((c) => c.performer_id),
  );

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
      <PendingSavesProvider key={performerId}>
        <PerformerSwitcher
          productionId={id}
          currentId={performerId}
          performers={performers.map((p) => ({
            id: p.id,
            label: p.label,
            createdAt: p.created_at,
            filled: filled.get(p.id) ?? 0,
          }))}
          roleOrder={roleOrder}
          total={definitions.length}
          fromSummary={backToSummary}
        />
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
      </PendingSavesProvider>
    </main>
  );
}
