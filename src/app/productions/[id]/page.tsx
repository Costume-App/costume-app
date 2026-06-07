import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers, getFilledMeasurementCounts } from "@/lib/data/performers";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { ProductionWorkspace } from "@/components/ProductionWorkspace";
import { DeleteProductionButton } from "@/components/DeleteProductionButton";

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

  const [casts, roles, castings, performers, definitions] = await Promise.all([
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
    listMeasurementDefinitions(),
  ]);

  // Per-performer measurement progress for the cast-list indicators.
  const filledCounts = await getFilledMeasurementCounts(performers.map((p) => p.id));
  const totalFields = definitions.length;
  const measurementStatus: Record<string, "none" | "partial" | "complete"> = {};
  for (const p of performers) {
    const filled = filledCounts[p.id] ?? 0;
    measurementStatus[p.id] =
      filled === 0 ? "none" : totalFields > 0 && filled >= totalFields ? "complete" : "partial";
  }

  const designs = await listCostumeDesigns(id);
  const pieces = await listCostumePieces(designs.map((d) => d.id));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/productions" className="link-muted text-sm">
          ← Productions
        </Link>
        <DeleteProductionButton productionId={id} />
      </div>
      <div className="mt-2 mb-6 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold leading-none">{production.title}</h1>
        <div className="flex flex-col items-end gap-1">
          {production.show_date && (
            <span className="text-sm muted">{formatShowDate(production.show_date)}</span>
          )}
          <CountdownBadge showDate={production.show_date} />
        </div>
      </div>

      <ProductionWorkspace
        productionId={id}
        initialCasts={casts.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        initialRoles={roles.map((r) => ({ id: r.id, name: r.name }))}
        initialPerformers={performers.map((p) => ({ id: p.id, name: p.label }))}
        initialCastings={castings.map((c) => ({
          id: c.id,
          castId: c.cast_id,
          roleId: c.role_id,
          performerId: c.performer_id,
          assignment: c.assignment,
        }))}
        measurementStatus={measurementStatus}
        initialDesigns={designs}
        initialPieces={pieces}
      />
    </main>
  );
}
