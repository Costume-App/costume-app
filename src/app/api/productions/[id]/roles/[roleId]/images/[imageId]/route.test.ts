import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertRoleInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertRoleInProduction: (...a: unknown[]) => assertRoleInProduction(...a),
}));

const deleteRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  deleteRoleImage: (...a: unknown[]) => deleteRoleImage(...a),
}));

const removeRoleImages = vi.fn();
vi.mock("@/lib/storage", () => ({
  removeRoleImages: (...a: unknown[]) => removeRoleImages(...a),
}));

import { DELETE } from "@/app/api/productions/[id]/roles/[roleId]/images/[imageId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, deleteRoleImage, removeRoleImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertRoleInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, roleId: string, imageId: string) => ({ params: Promise.resolve({ id, roleId, imageId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the row and the storage object (200)", async () => {
  deleteRoleImage.mockResolvedValue("p1/r1/a.jpg");
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(200);
  expect(deleteRoleImage).toHaveBeenCalledWith("r1", "i1");
  expect(removeRoleImages).toHaveBeenCalledWith(["p1/r1/a.jpg"]);
});

test("DELETE skips storage remove when nothing matched", async () => {
  deleteRoleImage.mockResolvedValue(null);
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(200);
  expect(removeRoleImages).not.toHaveBeenCalled();
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(404);
  expect(deleteRoleImage).not.toHaveBeenCalled();
});
