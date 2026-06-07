import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers } from "@/lib/data/performers";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
import { listRoleImagesForRoles } from "@/lib/data/role-images";
import { signRoleImageUrls } from "@/lib/storage";
import { NotFoundError } from "@/lib/errors";
import { TailorSummary } from "@/components/TailorSummary";
import type { RolePhoto } from "@/components/RolePhotoStrip";

export default async function TailorSummaryPage({
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

  const [casts, roles, castings, performers] = await Promise.all([
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);
  const designs = await listCostumeDesigns(id);
  const pieces = await listCostumePieces(designs.map((d) => d.id));

  // Role reference photos (read-only on this page) — one query + one batch sign,
  // grouped by role for the worklist.
  const roleImages = await listRoleImagesForRoles(roles.map((r) => r.id));
  const imageUrls = await signRoleImageUrls(roleImages.map((i) => i.storage_path));
  const photosByRole: Record<string, RolePhoto[]> = {};
  for (const img of roleImages) {
    (photosByRole[img.role_id] ??= []).push({ id: img.id, url: imageUrls[img.storage_path] ?? null });
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/productions/${id}`} className="link-muted text-sm">
        ← {production.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold">Tailor&apos;s summary</h1>
      <TailorSummary
        productionId={id}
        roles={roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes }))}
        designs={designs.map((d) => ({
          id: d.id,
          role_id: d.role_id,
          name: d.name,
          display_order: d.display_order,
        }))}
        castings={castings.map((c) => ({
          id: c.id,
          cast_id: c.cast_id,
          role_id: c.role_id,
          performer_id: c.performer_id,
          assignment: c.assignment,
        }))}
        performers={performers.map((p) => ({ id: p.id, name: p.label }))}
        casts={casts.map((c) => ({ id: c.id, name: c.name }))}
        initialPieces={pieces}
        photosByRole={photosByRole}
      />
    </main>
  );
}
