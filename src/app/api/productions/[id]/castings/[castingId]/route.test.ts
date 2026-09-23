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

const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const CX = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, removeCasting].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
});

const ctx = (id: string, castingId: string) => ({ params: Promise.resolve({ id, castingId }) });
const delReq = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the casting and reports whether the performer was deleted", async () => {
  removeCasting.mockResolvedValue({ performerDeleted: true });
  const res = await DELETE(delReq(), ctx(P1, C1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, performerDeleted: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", P1);
  expect(removeCasting).toHaveBeenCalledWith(P1, C1);
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(delReq(), ctx(P1, C1));
  expect(res.status).toBe(404);
  expect(removeCasting).not.toHaveBeenCalled();
});

test("DELETE 404 when the casting is not in the production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  removeCasting.mockRejectedValue(new NotFoundError("Casting not found"));
  const res = await DELETE(delReq(), ctx(P1, CX));
  expect(res.status).toBe(404);
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(delReq(), ctx("not-a-uuid", C1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID casting id without touching data", async () => {
  const res = await DELETE(delReq(), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
