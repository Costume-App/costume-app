import { getProductionByIdUnscoped, createProduction } from "@/lib/data/productions";
import { listRoles, insertRoleCopy } from "@/lib/data/roles";
import { listRoleImagesForRoles, addRoleImage } from "@/lib/data/role-images";
import { listCostumeDesigns, insertCostumeDesignCopy } from "@/lib/data/costume-designs";
import { listCostumeDesignImages, addCostumeDesignImage } from "@/lib/data/costume-design-images";
import { copyImage } from "@/lib/storage";
import { NotFoundError } from "@/lib/errors";

// Duplicate the DESIGN LAYER of a production into a new production owned by targetOrgId.
// Copies roles, role images, costume designs, and design images (image FILES duplicated to
// new paths). Never reads/writes performer-layer data (performers, casts, castings, pieces,
// measurements). A per-file copy failure is swallowed (logged); the image row is still made.
export async function copyDesignLayer(input: {
  sourceProductionId: string;
  targetOrgId: string;
  userId: string;
}): Promise<{ productionId: string }> {
  const src = await getProductionByIdUnscoped(input.sourceProductionId);
  if (!src) throw new NotFoundError("Production not found");

  const newProd = await createProduction({
    orgId: input.targetOrgId,
    createdBy: input.userId,
    title: src.title,
    notes: src.notes,
  });

  const roles = await listRoles(input.sourceProductionId);
  const roleIdMap = new Map<string, string>();
  for (const role of roles) {
    const copy = await insertRoleCopy({
      productionId: newProd.id,
      name: role.name,
      notes: role.notes,
      displayOrder: role.display_order,
    });
    roleIdMap.set(role.id, copy.id);
  }

  const roleImages = await listRoleImagesForRoles(roles.map((r) => r.id));
  for (const img of roleImages) {
    const newRoleId = roleIdMap.get(img.role_id);
    if (!newRoleId) continue;
    const newPath = `${newProd.id}/${newRoleId}/${crypto.randomUUID()}.jpg`;
    try {
      await copyImage(img.storage_path, newPath);
    } catch (e) {
      console.error("Share copy: role image copy failed", e);
    }
    await addRoleImage(newRoleId, newPath);
  }

  const designs = await listCostumeDesigns(input.sourceProductionId);
  for (const design of designs) {
    const newRoleId = roleIdMap.get(design.role_id);
    if (!newRoleId) continue;
    const copy = await insertCostumeDesignCopy({
      productionId: newProd.id,
      roleId: newRoleId,
      name: design.name,
      notes: design.notes,
      displayOrder: design.display_order,
    });
    const images = await listCostumeDesignImages(design.id);
    for (const img of images) {
      const newPath = `${newProd.id}/designs/${copy.id}/${crypto.randomUUID()}.jpg`;
      try {
        await copyImage(img.storage_path, newPath);
      } catch (e) {
        console.error("Share copy: design image copy failed", e);
      }
      await addCostumeDesignImage(copy.id, newPath);
    }
  }

  return { productionId: newProd.id };
}
