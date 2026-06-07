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
import { formatShowDate, nextUpcomingDate, todayIso } from "@/lib/countdown";
import { ProductionWorkspace } from "@/components/ProductionWorkspace";
import { listShowDates } from "@/lib/data/show-dates";
import { EditableProductionHeader } from "@/components/EditableProductionHeader";
import { DeleteProductionButton } from "@/components/DeleteProductionButton";
import { classifyProduction } from "@/lib/production-status";
import { ToggleProductionActiveButton } from "@/components/ToggleProductionActiveButton";

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

  const [showDates, casts, roles, castings, performers, definitions] = await Promise.all([
    listShowDates([id]),
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
    listMeasurementDefinitions(),
  ]);

  const nextUpcoming = nextUpcomingDate(showDates.map((d) => d.show_date), todayIso());

  const status = classifyProduction(production.is_active, showDates.map((d) => d.show_date), todayIso());
  const statusLabel = status === "inactive" ? "Inactive" : status === "past" ? "Past" : null;

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
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6 flex items-start justify-between gap-3">
        <EditableProductionHeader
          productionId={id}
          title={production.title}
          showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date }))}
        />
        <div className="flex flex-col items-end gap-1">
          {statusLabel && <span className="chip">{statusLabel}</span>}
          {nextUpcoming && <span className="text-sm muted">{formatShowDate(nextUpcoming)}</span>}
          <CountdownBadge showDate={nextUpcoming} />
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
      <div className="mt-8 space-y-4 border-t border-[var(--field-line)] pt-4">
        <ToggleProductionActiveButton productionId={id} isActive={production.is_active} />
        <DeleteProductionButton productionId={id} />
      </div>
    </main>
  );
}
