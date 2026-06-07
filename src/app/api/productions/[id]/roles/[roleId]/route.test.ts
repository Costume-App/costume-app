import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const deleteRole = vi.fn();
const setRoleNotes = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  deleteRole: (...a: unknown[]) => deleteRole(...a),
  setRoleNotes: (...a: unknown[]) => setRoleNotes(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/roles/[roleId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteRole, setRoleNotes].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
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
  expect(deleteRole).toHaveBeenCalledWith("p1", "r1");
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
