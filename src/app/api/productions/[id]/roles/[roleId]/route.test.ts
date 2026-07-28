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

const deleteRole = vi.fn();
const setRoleNotes = vi.fn();
const updateRole = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  deleteRole: (...a: unknown[]) => deleteRole(...a),
  setRoleNotes: (...a: unknown[]) => setRoleNotes(...a),
  updateRole: (...a: unknown[]) => updateRole(...a),
}));

const listRoleImagePaths = vi.fn();
vi.mock("@/lib/data/storage-paths", () => ({
  listRoleImagePaths: (...a: unknown[]) => listRoleImagePaths(...a),
}));

const removeImages = vi.fn();
vi.mock("@/lib/storage", () => ({
  removeImages: (...a: unknown[]) => removeImages(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/roles/[roleId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, deleteRole, setRoleNotes, updateRole, listRoleImagePaths, removeImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertRoleInProduction.mockResolvedValue(undefined);
  listRoleImagePaths.mockResolvedValue(["p1/r1/a.jpg"]);
  removeImages.mockResolvedValue(undefined);
});

const ctx = (id: string, roleId: string) => ({ params: Promise.resolve({ id, roleId }) });
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("DELETE removes a role (200)", async () => {
  deleteRole.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(assertRoleInProduction).toHaveBeenCalledWith("p1", "r1");
  expect(listRoleImagePaths).toHaveBeenCalledWith("r1");
  expect(removeImages).toHaveBeenCalledWith(["p1/r1/a.jpg"]);
  expect(deleteRole).toHaveBeenCalledWith("p1", "r1");
});

test("DELETE removes storage objects before deleting the role row", async () => {
  deleteRole.mockResolvedValue(undefined);
  await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "r1"));
  expect(removeImages.mock.invocationCallOrder[0]).toBeLessThan(deleteRole.mock.invocationCallOrder[0]);
});

test("DELETE 404 when the role is not in that production (cross-production/cross-org) — storage untouched", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertRoleInProduction.mockRejectedValue(new NotFoundError("Role not found in this production"));
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "r1"));
  expect(res.status).toBe(404);
  expect(listRoleImagePaths).not.toHaveBeenCalled();
  expect(removeImages).not.toHaveBeenCalled();
  expect(deleteRole).not.toHaveBeenCalled();
});

test("PATCH with a name renames the role via updateRole (200)", async () => {
  updateRole.mockResolvedValue({ id: "r1", name: "Bert" });
  const res = await PATCH(patchReq({ name: "Bert" }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: "r1", name: "Bert" } });
  expect(updateRole).toHaveBeenCalledWith("p1", "r1", "Bert");
  expect(setRoleNotes).not.toHaveBeenCalled();
});

test("PATCH saves role notes (200)", async () => {
  setRoleNotes.mockResolvedValue({ id: "r1", notes: "blue dress" });
  const res = await PATCH(patchReq({ notes: "blue dress" }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: "r1", notes: "blue dress" } });
  expect(setRoleNotes).toHaveBeenCalledWith("p1", "r1", "blue dress");
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ notes: "x" }), ctx("p1", "r1"));
  expect(res.status).toBe(404);
  expect(setRoleNotes).not.toHaveBeenCalled();
});
