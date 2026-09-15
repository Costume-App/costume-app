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

const listRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({ listRoles: (...a: unknown[]) => listRoles(...a) }));

const listCasts = vi.fn();
vi.mock("@/lib/data/casts", () => ({ listCasts: (...a: unknown[]) => listCasts(...a) }));

const addCastMember = vi.fn();
const listCastings = vi.fn();
vi.mock("@/lib/data/castings", () => ({
  addCastMember: (...a: unknown[]) => addCastMember(...a),
  listCastings: (...a: unknown[]) => listCastings(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/castings/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listRoles, listCasts, addCastMember, listCastings].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listRoles.mockResolvedValue([
    { id: "r1", name: "Bert", is_ensemble: false },
    { id: "r2", name: "Villagers", is_ensemble: true },
  ]);
  listCasts.mockResolvedValue([{ id: "ct1", name: "Gold" }]);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST adds a cast member (201)", async () => {
  addCastMember.mockResolvedValue({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", cast_id: "ct1", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    castId: "ct1",
    roleId: "r1",
    roleIsEnsemble: false,
    name: "Ava",
    assignment: "primary",
  });
});

test("POST 404 when the role is not in the production", async () => {
  const res = await POST(postReq({ castId: "ct1", roleId: "rX", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addCastMember).not.toHaveBeenCalled();
});

test("POST 404 when the cast is not in the production", async () => {
  const res = await POST(postReq({ castId: "ctX", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addCastMember).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  addCastMember.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ castId: "ct1", roleId: "r1", name: "", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(400);
});

test("POST with performerId reuses a performer on an ensemble role", async () => {
  addCastMember.mockResolvedValue({
    performer: { id: "pf1", label: "Amy" },
    casting: { id: "c5", cast_id: "ct1", role_id: "r2", performer_id: "pf1", assignment: "ensemble" },
  });
  const res = await POST(postReq({ castId: "ct1", roleId: "r2", performerId: "pf1", assignment: "ensemble" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    castId: "ct1",
    roleId: "r2",
    roleIsEnsemble: true,
    assignment: "ensemble",
    performerId: "pf1",
  });
});

test("POST defaults a missing assignment to ensemble for ensemble roles", async () => {
  addCastMember.mockResolvedValue({ performer: {}, casting: {} });
  await POST(postReq({ castId: "ct1", roleId: "r2", name: "Zed" }), ctx("p1"));
  expect(addCastMember).toHaveBeenCalledWith(expect.objectContaining({ assignment: "ensemble", name: "Zed" }));
});

test("GET lists the production's castings", async () => {
  listCastings.mockResolvedValue([{ id: "c1", assignment: "primary" }]);
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ castings: [{ id: "c1", assignment: "primary" }] });
  expect(listCastings).toHaveBeenCalledWith("p1");
});

test("GET 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
});
