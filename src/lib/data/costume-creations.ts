import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers, getMeasurementsForPerformers } from "@/lib/data/performers";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
import { listRoleImagesForRoles } from "@/lib/data/role-images";
import { signRoleImageUrls } from "@/lib/storage";
import { listMakers } from "@/lib/data/makers";
import { listFabricWidths, listFabricSuppliers } from "@/lib/data/fabric-settings";
import { buildMeasurementsByCasting } from "@/lib/tailor-summary";
import type { Production } from "@/lib/data/productions";
import type { RolePhoto } from "@/components/RolePhotoStrip";

// Assembles everything <TailorSummary> needs for one production. Shared by the
// Costume Creations page and the My Work page (which calls it per production).
export async function loadCostumeCreationsData(orgId: string, production: Production) {
  const id = production.id;
  const [casts, roles, castings, performers] = await Promise.all([
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);
  const designs = await listCostumeDesigns(id);
  const pieces = await listCostumePieces(designs.map((d) => d.id));

  const roleImages = await listRoleImagesForRoles(roles.map((r) => r.id));
  const imageUrls = await signRoleImageUrls(roleImages.map((i) => i.storage_path));
  const photosByRole: Record<string, RolePhoto[]> = {};
  for (const img of roleImages) {
    (photosByRole[img.role_id] ??= []).push({ id: img.id, url: imageUrls[img.storage_path] ?? null });
  }

  const [definitions, measurements] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurementsForPerformers(performers.map((p) => p.id)),
  ]);
  const measurementsByCasting = buildMeasurementsByCasting(definitions, measurements, castings);
  const makers = await listMakers(orgId);
  const [fabricWidths, fabricSuppliers] = await Promise.all([
    listFabricWidths(orgId),
    listFabricSuppliers(orgId),
  ]);

  return {
    productionId: id,
    roles: roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes })),
    designs: designs.map((d) => ({
      id: d.id,
      role_id: d.role_id,
      name: d.name,
      display_order: d.display_order,
      inventory_item_id: d.inventory_item_id,
    })),
    castings: castings.map((c) => ({
      id: c.id,
      cast_id: c.cast_id,
      role_id: c.role_id,
      performer_id: c.performer_id,
      assignment: c.assignment,
    })),
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    casts: casts.map((c) => ({ id: c.id, name: c.name })),
    initialPieces: pieces,
    photosByRole,
    measurementsByCasting,
    makers: makers.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    fabricWidths: fabricWidths.map((w) => ({ id: w.id, value: w.value, isDefault: w.is_default })),
    fabricSuppliers: fabricSuppliers.map((s) => ({ id: s.id, name: s.name, pricePerYard: s.price_per_yard, isDefault: s.is_default })),
    costumesDueDate: production.costumes_due_date,
  };
}
