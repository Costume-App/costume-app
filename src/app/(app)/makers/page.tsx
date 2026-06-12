import { getAuthContext } from "@/lib/auth-context";
import { listMakers } from "@/lib/data/makers";
import { MakersManager } from "@/components/MakersManager";

export default async function MakersPage() {
  const { orgId } = await getAuthContext();
  const makers = await listMakers(orgId);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">Makers</h1>
        <p className="mt-1 text-sm muted">
          Your costume team. Assign them to pieces to make, and track who&apos;s done.
        </p>
      </div>
      <MakersManager
        initialMakers={makers.map((m) => ({ id: m.id, name: m.name, color: m.color, clerk_user_id: m.clerk_user_id ?? null }))}
      />
    </main>
  );
}
