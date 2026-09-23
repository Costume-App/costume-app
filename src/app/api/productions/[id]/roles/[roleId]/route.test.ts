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
const setRoleEnsemble = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  deleteRole: (...a: unknown[]) => deleteRole(...a),
  setRoleNotes: (...a: unknown[]) => setRoleNotes(...a),
  updateRole: (...a: unknown[]) => updateRole(...a),
  setRoleEnsemble: (...a: unknown[]) => setRoleEnsemble(...a),
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

const P1 = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, deleteRole, setRoleNotes, updateRole, setRoleEnsemble, listRoleImagePaths, removeImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertRoleInProduction.mockResolvedValue(undefined);
  listRoleImagePaths.mockResolvedValue([`${P1}/${R1}/a.jpg`]);
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
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, R1));
  expect(res.status).toBe(200);
  expect(assertRoleInProduction).toHaveBeenCalledWith(P1, R1);
  expect(listRoleImagePaths).toHaveBeenCalledWith(R1);
  expect(removeImages).toHaveBeenCalledWith([`${P1}/${R1}/a.jpg`]);
  expect(deleteRole).toHaveBeenCalledWith(P1, R1);
});

test("DELETE removes storage objects before deleting the role row", async () => {
  deleteRole.mockResolvedValue(undefined);
  await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, R1));
  expect(removeImages.mock.invocationCallOrder[0]).toBeLessThan(deleteRole.mock.invocationCallOrder[0]);
});

test("DELETE 404 when the role is not in that production (cross-production/cross-org), storage untouched", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertRoleInProduction.mockRejectedValue(new NotFoundError("Role not found in this production"));
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, R1));
  expect(res.status).toBe(404);
  expect(listRoleImagePaths).not.toHaveBeenCalled();
  expect(removeImages).not.toHaveBeenCalled();
  expect(deleteRole).not.toHaveBeenCalled();
});

test("PATCH with a name renames the role via updateRole (200)", async () => {
  updateRole.mockResolvedValue({ id: R1, name: "Bert" });
  const res = await PATCH(patchReq({ name: "Bert" }), ctx(P1, R1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: R1, name: "Bert" } });
  expect(updateRole).toHaveBeenCalledWith(P1, R1, "Bert");
  expect(setRoleNotes).not.toHaveBeenCalled();
});

test("PATCH saves role notes (200)", async () => {
  setRoleNotes.mockResolvedValue({ id: R1, notes: "blue dress" });
  const res = await PATCH(patchReq({ notes: "blue dress" }), ctx(P1, R1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: R1, notes: "blue dress" } });
  expect(setRoleNotes).toHaveBeenCalledWith(P1, R1, "blue dress");
});

test("PATCH with isEnsemble flips the role via setRoleEnsemble (200)", async () => {
  setRoleEnsemble.mockResolvedValue({ id: R1, name: "Villagers", is_ensemble: true });
  const res = await PATCH(patchReq({ isEnsemble: true }), ctx(P1, R1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: R1, name: "Villagers", is_ensemble: true } });
  expect(setRoleEnsemble).toHaveBeenCalledWith(P1, R1, true);
  expect(updateRole).not.toHaveBeenCalled();
  expect(setRoleNotes).not.toHaveBeenCalled();
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ notes: "x" }), ctx(P1, R1));
  expect(res.status).toBe(404);
  expect(setRoleNotes).not.toHaveBeenCalled();
});

test("PATCH with a non-boolean isEnsemble is a 400 and never clears notes", async () => {
  const res = await PATCH(patchReq({ isEnsemble: "yes" }), ctx(P1, R1));
  expect(res.status).toBe(400);
  expect(setRoleNotes).not.toHaveBeenCalled();
  expect(setRoleEnsemble).not.toHaveBeenCalled();
});

test("PATCH with no recognised field is a 400 and never clears notes", async () => {
  const res = await PATCH(patchReq({}), ctx(P1, R1));
  expect(res.status).toBe(400);
  expect(setRoleNotes).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("not-a-uuid", R1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID role id without touching data", async () => {
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID production id without touching data", async () => {
  const res = await PATCH(patchReq({ notes: "x" }), ctx("not-a-uuid", R1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID role id without touching data", async () => {
  const res = await PATCH(patchReq({ notes: "x" }), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
