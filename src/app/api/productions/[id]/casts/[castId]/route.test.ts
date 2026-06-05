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

const listCasts = vi.fn();
const deleteCast = vi.fn();
const updateCast = vi.fn();
vi.mock("@/lib/data/casts", () => ({
  listCasts: (...a: unknown[]) => listCasts(...a),
  deleteCast: (...a: unknown[]) => deleteCast(...a),
  updateCast: (...a: unknown[]) => updateCast(...a),
}));

import { PATCH, DELETE } from "@/app/api/productions/[id]/casts/[castId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listCasts, deleteCast, updateCast].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, castId: string) => ({ params: Promise.resolve({ id, castId }) });
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH renames a cast (200)", async () => {
  updateCast.mockResolvedValue({ id: "ct1", name: "Gold Cast" });
  const res = await PATCH(patchReq({ name: "Gold Cast" }), ctx("p1", "ct1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ cast: { id: "ct1", name: "Gold Cast" } });
  expect(updateCast).toHaveBeenCalledWith("p1", "ct1", "Gold Cast", undefined);
});

test("PATCH forwards a color when provided", async () => {
  updateCast.mockResolvedValue({ id: "ct1", name: "Gold Cast", color: "gold" });
  const res = await PATCH(patchReq({ name: "Gold Cast", color: "gold" }), ctx("p1", "ct1"));
  expect(res.status).toBe(200);
  expect(updateCast).toHaveBeenCalledWith("p1", "ct1", "Gold Cast", "gold");
});

test("PATCH 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  updateCast.mockRejectedValue(new ValidationError("Cast name is required"));
  const res = await PATCH(patchReq({ name: "" }), ctx("p1", "ct1"));
  expect(res.status).toBe(400);
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ name: "X" }), ctx("p1", "ct1"));
  expect(res.status).toBe(404);
});

test("DELETE removes a cast when more than one exists", async () => {
  listCasts.mockResolvedValue([{ id: "ct1" }, { id: "ct2" }]);
  deleteCast.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "ct2"));
  expect(res.status).toBe(200);
  expect(deleteCast).toHaveBeenCalledWith("p1", "ct2");
});

test("DELETE 400 when it's the last cast", async () => {
  listCasts.mockResolvedValue([{ id: "ct1" }]);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "ct1"));
  expect(res.status).toBe(400);
  expect(deleteCast).not.toHaveBeenCalled();
});
