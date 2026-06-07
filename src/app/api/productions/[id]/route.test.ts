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

const deleteProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
}));

import { DELETE } from "@/app/api/productions/[id]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteProduction].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the production, scoped to the caller's org (200)", async () => {
  deleteProduction.mockResolvedValue(undefined);
  const res = await DELETE(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(deleteProduction).toHaveBeenCalledWith("org_1", "p1");
});

test("DELETE 404 when the production is not in the caller's org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx("p1"));
  expect(res.status).toBe(404);
  expect(deleteProduction).not.toHaveBeenCalled();
});

test("DELETE 500 when the delete fails unexpectedly", async () => {
  deleteProduction.mockRejectedValue(new Error("db exploded"));
  const res = await DELETE(req(), ctx("p1"));
  expect(res.status).toBe(500);
});
