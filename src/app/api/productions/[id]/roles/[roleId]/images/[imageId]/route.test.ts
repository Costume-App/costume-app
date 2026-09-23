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

const P1 = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const I1 = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, deleteRoleImage, removeRoleImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertRoleInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, roleId: string, imageId: string) => ({ params: Promise.resolve({ id, roleId, imageId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the row and the storage object (200)", async () => {
  deleteRoleImage.mockResolvedValue(`${P1}/${R1}/a.jpg`);
  const res = await DELETE(req(), ctx(P1, R1, I1));
  expect(res.status).toBe(200);
  expect(deleteRoleImage).toHaveBeenCalledWith(R1, I1);
  expect(removeRoleImages).toHaveBeenCalledWith([`${P1}/${R1}/a.jpg`]);
});

test("DELETE skips storage remove when nothing matched", async () => {
  deleteRoleImage.mockResolvedValue(null);
  const res = await DELETE(req(), ctx(P1, R1, I1));
  expect(res.status).toBe(200);
  expect(removeRoleImages).not.toHaveBeenCalled();
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx(P1, R1, I1));
  expect(res.status).toBe(404);
  expect(deleteRoleImage).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(req(), ctx("not-a-uuid", R1, I1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID role id without touching data", async () => {
  const res = await DELETE(req(), ctx(P1, "not-a-uuid", I1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID image id without touching data", async () => {
  const res = await DELETE(req(), ctx(P1, R1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
