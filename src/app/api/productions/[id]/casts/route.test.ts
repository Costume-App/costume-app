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
const createCast = vi.fn();
vi.mock("@/lib/data/casts", () => ({
  listCasts: (...a: unknown[]) => listCasts(...a),
  createCast: (...a: unknown[]) => createCast(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/casts/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listCasts, createCast].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});

test("GET lists casts", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listCasts.mockResolvedValue([{ id: "ct1", name: "Gold" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ casts: [{ id: "ct1", name: "Gold" }] });
  expect(listCasts).toHaveBeenCalledWith("p1");
});

test("POST creates a cast (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createCast.mockResolvedValue({ id: "ct2", name: "Blue", color: "blue" });
  const res = await POST(postReq({ name: "Blue", color: "blue" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createCast).toHaveBeenCalledWith({ productionId: "p1", name: "Blue", color: "blue" });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createCast.mockRejectedValue(new ValidationError("Cast name is required"));
  const res = await POST(postReq({ name: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});
