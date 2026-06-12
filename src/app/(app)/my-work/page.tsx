import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { findMakerByUser } from "@/lib/data/makers";
import { listAssignmentsForMaker } from "@/lib/data/maker-assignments";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { todayIso } from "@/lib/countdown";
import { TailorSummary } from "@/components/TailorSummary";

export default async function MyWorkPage() {
  const { orgId, userId } = await getAuthContext();
  const maker = await findMakerByUser(orgId, userId);

  const heading = (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-semibold">My Work</h1>
      <p className="mt-1 text-sm muted">Costume pieces assigned to you, by production.</p>
    </div>
  );

  if (!maker) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        {heading}
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          You&apos;re not linked to a maker yet. Link yourself from Makers (in the organization menu), or ask an admin.
        </p>
      </main>
    );
  }

  // Distinct productions this maker has assignments in (assignments are already
  // sorted by production title).
  const assignments = await listAssignmentsForMaker(orgId, maker.id);
  const productions: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (!seen.has(a.productionId)) {
      seen.add(a.productionId);
      productions.push({ id: a.productionId, title: a.productionTitle });
    }
  }

  if (productions.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        {heading}
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          Nothing assigned to you yet.
        </p>
      </main>
    );
  }

  const today = todayIso();
  const sections = await Promise.all(
    productions.map(async (p) => {
      const production = await assertProductionInOrg(orgId, p.id);
      const data = await loadCostumeCreationsData(orgId, production);
      return { id: p.id, title: p.title, data };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      {heading}
      <div className="space-y-10">
        {sections.map((s) => (
          <section key={s.id} className="space-y-4">
            <Link
              href={`/productions/${s.id}`}
              className="block font-display text-xl font-semibold hover:text-[var(--red)] hover:underline"
            >
              {s.title}
            </Link>
            <TailorSummary {...s.data} filterMakerId={maker.id} today={today} />
          </section>
        ))}
      </div>
    </main>
  );
}
