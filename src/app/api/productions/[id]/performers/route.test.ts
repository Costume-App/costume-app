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

const listPerformers = vi.fn();
const createPerformer = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  listPerformers: (...a: unknown[]) => listPerformers(...a),
  createPerformer: (...a: unknown[]) => createPerformer(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/performers/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listPerformers, createPerformer].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function postReq(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});

test("GET lists performers for an in-org production", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listPerformers.mockResolvedValue([{ id: "pf1", label: "Bert" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ performers: [{ id: "pf1", label: "Bert" }] });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(listPerformers).toHaveBeenCalledWith("p1");
});

test("POST creates a performer (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createPerformer.mockResolvedValue({ id: "pf2", label: "Mary" });
  const res = await POST(postReq({ label: "Mary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createPerformer).toHaveBeenCalledWith({ productionId: "p1", label: "Mary" });
});

test("POST 400 on empty label", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createPerformer.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ label: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});
