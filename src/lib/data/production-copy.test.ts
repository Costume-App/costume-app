import { expect, test, vi, beforeEach } from "vitest";

const getProductionByIdUnscoped = vi.fn();
const createProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  getProductionByIdUnscoped: (...a: unknown[]) => getProductionByIdUnscoped(...a),
  createProduction: (...a: unknown[]) => createProduction(...a),
}));

const listRoles = vi.fn();
const insertRoleCopy = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  insertRoleCopy: (...a: unknown[]) => insertRoleCopy(...a),
}));

const listRoleImagesForRoles = vi.fn();
const addRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  listRoleImagesForRoles: (...a: unknown[]) => listRoleImagesForRoles(...a),
  addRoleImage: (...a: unknown[]) => addRoleImage(...a),
}));

const listCostumeDesigns = vi.fn();
const insertCostumeDesignCopy = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({
  listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a),
  insertCostumeDesignCopy: (...a: unknown[]) => insertCostumeDesignCopy(...a),
}));

const listCostumeDesignImages = vi.fn();
const addCostumeDesignImage = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({
  listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a),
  addCostumeDesignImage: (...a: unknown[]) => addCostumeDesignImage(...a),
}));

const copyImage = vi.fn();
vi.mock("@/lib/storage", () => ({ copyImage: (...a: unknown[]) => copyImage(...a) }));

import { copyDesignLayer } from "@/lib/data/production-copy";

beforeEach(() => {
  [getProductionByIdUnscoped, createProduction, listRoles, insertRoleCopy, listRoleImagesForRoles,
    addRoleImage, listCostumeDesigns, insertCostumeDesignCopy, listCostumeDesignImages,
    addCostumeDesignImage, copyImage].forEach((m) => m.mockReset());
});

test("copyDesignLayer copies production, roles, designs, and duplicates images to new paths", async () => {
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats", notes: "fun" });
  createProduction.mockResolvedValue({ id: "p2" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Wizard", notes: "fl", display_order: 0, is_ensemble: true }]);
  insertRoleCopy.mockResolvedValue({ id: "r1new" });
  listRoleImagesForRoles.mockResolvedValue([{ id: "ri1", role_id: "r1", storage_path: "p1/r1/a.jpg" }]);
  addRoleImage.mockResolvedValue({});
  listCostumeDesigns.mockResolvedValue([{ id: "d1", role_id: "r1", name: "Cloak", notes: "dn", display_order: 0 }]);
  insertCostumeDesignCopy.mockResolvedValue({ id: "d1new" });
  listCostumeDesignImages.mockResolvedValue([{ id: "di1", costume_design_id: "d1", storage_path: "p1/designs/d1/b.jpg" }]);
  addCostumeDesignImage.mockResolvedValue({});
  copyImage.mockResolvedValue(undefined);

  const out = await copyDesignLayer({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });

  expect(createProduction).toHaveBeenCalledWith({ orgId: "orgB", createdBy: "u1", title: "Cats", notes: "fun" });
  expect(insertRoleCopy).toHaveBeenCalledWith({ productionId: "p2", name: "Wizard", notes: "fl", displayOrder: 0, isEnsemble: true });
  expect(copyImage).toHaveBeenCalledWith("p1/r1/a.jpg", expect.stringMatching(/^p2\/r1new\/.+\.jpg$/));
  expect(addRoleImage).toHaveBeenCalledWith("r1new", expect.stringMatching(/^p2\/r1new\/.+\.jpg$/));
  expect(insertCostumeDesignCopy).toHaveBeenCalledWith({ productionId: "p2", roleId: "r1new", name: "Cloak", notes: "dn", displayOrder: 0 });
  expect(copyImage).toHaveBeenCalledWith("p1/designs/d1/b.jpg", expect.stringMatching(/^p2\/designs\/d1new\/.+\.jpg$/));
  expect(addCostumeDesignImage).toHaveBeenCalledWith("d1new", expect.stringMatching(/^p2\/designs\/d1new\/.+\.jpg$/));
  expect(out).toEqual({ productionId: "p2" });
});

test("copyDesignLayer still inserts the image row when the file copy fails (best-effort)", async () => {
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats", notes: null });
  createProduction.mockResolvedValue({ id: "p2" });
  listRoles.mockResolvedValue([{ id: "r1", name: "Wizard", notes: null, display_order: 0, is_ensemble: true }]);
  insertRoleCopy.mockResolvedValue({ id: "r1new" });
  listRoleImagesForRoles.mockResolvedValue([{ id: "ri1", role_id: "r1", storage_path: "p1/r1/a.jpg" }]);
  addRoleImage.mockResolvedValue({});
  listCostumeDesigns.mockResolvedValue([]);
  copyImage.mockRejectedValue(new Error("missing object"));

  await copyDesignLayer({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });
  expect(addRoleImage).toHaveBeenCalledTimes(1); // row still created despite copy failure
});
