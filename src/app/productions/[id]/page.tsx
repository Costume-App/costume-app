import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { NotFoundError } from "@/lib/errors";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";
import { CastBoard, type RoleWithCast } from "@/components/CastBoard";

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

  const [roles, castings, performers] = await Promise.all([
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);

  const nameById = new Map(performers.map((p) => [p.id, p.label]));
  const rolesWithCast: RoleWithCast[] = roles.map((role) => {
    const forRole = castings.filter((c) => c.role_id === role.id);
    const primaryCasting = forRole.find((c) => c.assignment === "primary");
    return {
      roleId: role.id,
      roleName: role.name,
      primary: primaryCasting
        ? { performerId: primaryCasting.performer_id, name: nameById.get(primaryCasting.performer_id) ?? "" }
        : null,
      understudies: forRole
        .filter((c) => c.assignment === "understudy")
        .map((c) => ({ performerId: c.performer_id, name: nameById.get(c.performer_id) ?? "" })),
    };
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="text-sm text-gray-500 hover:underline">
        ← Productions
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{production.title}</h1>
        <div className="flex items-center gap-2">
          {production.show_date && (
            <span className="text-sm text-gray-600">{formatShowDate(production.show_date)}</span>
          )}
          <CountdownBadge showDate={production.show_date} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Roles &amp; cast</h2>
        <CastBoard productionId={id} initialRoles={rolesWithCast} />
      </section>
    </main>
  );
}
