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

const removeCasting = vi.fn();
vi.mock("@/lib/data/castings", () => ({ removeCasting: (...a: unknown[]) => removeCasting(...a) }));

import { DELETE } from "@/app/api/productions/[id]/castings/[castingId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, removeCasting].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, castingId: string) => ({ params: Promise.resolve({ id, castingId }) });
const delReq = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the casting and reports whether the performer was deleted", async () => {
  removeCasting.mockResolvedValue({ performerDeleted: true });
  const res = await DELETE(delReq(), ctx("p1", "c1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, performerDeleted: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(removeCasting).toHaveBeenCalledWith("p1", "c1");
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(delReq(), ctx("p1", "c1"));
  expect(res.status).toBe(404);
  expect(removeCasting).not.toHaveBeenCalled();
});

test("DELETE 404 when the casting is not in the production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  removeCasting.mockRejectedValue(new NotFoundError("Casting not found"));
  const res = await DELETE(delReq(), ctx("p1", "cX"));
  expect(res.status).toBe(404);
});
