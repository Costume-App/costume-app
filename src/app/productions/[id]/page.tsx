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
import { listMakers } from "@/lib/data/makers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate, formatShowTime, todayIso } from "@/lib/countdown";
import { ProductionWorkspace } from "@/components/ProductionWorkspace";
import { listShowDates } from "@/lib/data/show-dates";
import { findCuratedMatch } from "@/lib/data/play-catalog";
import { roleIdsWithImages } from "@/lib/data/role-images";
import { EditableProductionHeader } from "@/components/EditableProductionHeader";
import { ShowingsList } from "@/components/ShowingsList";
import { ProductionNotes } from "@/components/ProductionNotes";
import { DeleteProductionButton } from "@/components/DeleteProductionButton";
import { classifyProduction } from "@/lib/production-status";

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

  const imageRoleIds = await roleIdsWithImages(roles.map((r) => r.id));

  const status = classifyProduction(production.is_active, showDates.map((d) => d.show_date), todayIso());
  const statusLabel = status === "inactive" ? "Inactive" : null;
  // showDates arrive sorted by date then time. The next showing is the first one
  // dated today-or-later; for a past production, fall back to the last showing.
  const today = todayIso();
  const upcomingShowings = showDates.filter((s) => s.show_date >= today);
  const nextShowing = upcomingShowings[0] ?? showDates[showDates.length - 1] ?? null;

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
  const makers = await listMakers(orgId);

  const curated = findCuratedMatch(production.title);
  const roleSuggestion = curated
    ? { id: curated.id, title: curated.title, roles: curated.roles }
    : null;
  const aiEnabled = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <EditableProductionHeader
          productionId={id}
          title={production.title}
          showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date, show_time: d.show_time }))}
          isActive={production.is_active}
        />
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {statusLabel && (
            <span className="inline-flex items-center rounded-full border border-[var(--field-line)] px-2.5 py-0.5 text-xs muted">
              {statusLabel}
            </span>
          )}
          {nextShowing && (
            <span className="text-sm muted">
              {formatShowDate(nextShowing.show_date)}
              {nextShowing.show_time ? ` · ${formatShowTime(nextShowing.show_time)}` : ""}
            </span>
          )}
          <CountdownBadge showDate={nextShowing ? nextShowing.show_date : null} />
        </div>
      </div>

      {showDates.length > 0 && (
        <div className="mb-6">
          <ShowingsList showings={showDates} collapsible />
        </div>
      )}

      <div className="mb-6">
        <ProductionNotes productionId={id} notes={production.notes} />
        <div className="mt-1 flex justify-end">
          <Link
            href={`/productions/${id}/summary`}
            className="link-muted whitespace-nowrap text-sm"
          >
            Tailor&apos;s summary →
          </Link>
        </div>
      </div>

      <ProductionWorkspace
        productionId={id}
        initialCasts={casts.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        initialRoles={roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes }))}
        initialPerformers={performers.map((p) => ({ id: p.id, name: p.label }))}
        initialCastings={castings.map((c) => ({
          id: c.id,
          castId: c.cast_id,
          roleId: c.role_id,
          performerId: c.performer_id,
          assignment: c.assignment,
        }))}
        measurementStatus={measurementStatus}
        imageRoleIds={imageRoleIds}
        initialDesigns={designs}
        initialPieces={pieces}
        makers={makers.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
        roleSuggestion={roleSuggestion}
        aiEnabled={aiEnabled}
      />
      <div className="mt-8 border-t border-[var(--field-line)] pt-4">
        <DeleteProductionButton productionId={id} />
      </div>
    </main>
  );
}
