import { getAuthContext } from "@/lib/auth-context";
import { findMakerByUser } from "@/lib/data/makers";
import { listAssignmentsForMaker } from "@/lib/data/maker-assignments";
import { MyWorkList } from "@/components/MyWorkList";

export default async function MyWorkPage() {
  const { orgId, userId } = await getAuthContext();
  const maker = await findMakerByUser(orgId, userId);
  const assignments = maker ? await listAssignmentsForMaker(orgId, maker.id) : [];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">My Work</h1>
        <p className="mt-1 text-sm muted">Costume pieces assigned to you, across productions.</p>
      </div>
      {!maker ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          You&apos;re not linked to a maker yet. Link yourself from Makers (in the organization menu), or ask an admin.
        </p>
      ) : (
        <MyWorkList initial={assignments} />
      )}
    </main>
  );
}
