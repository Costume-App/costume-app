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
const createRole = vi.fn();
const createRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  createRole: (...a: unknown[]) => createRole(...a),
  createRoles: (...a: unknown[]) => createRoles(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/roles/route";

const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listRoles, createRole, createRoles].forEach((m) => m.mockReset());
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
  const res = await GET(new Request("http://test"), ctx(P1));
  expect(res.status).toBe(404);
});

test("GET lists roles", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  listRoles.mockResolvedValue([{ id: "r1", name: "Bert" }]);
  const res = await GET(new Request("http://test"), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ roles: [{ id: "r1", name: "Bert" }] });
  expect(listRoles).toHaveBeenCalledWith(P1);
});

test("POST creates a role (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  createRole.mockResolvedValue({ id: "r2", name: "Mary Poppins" });
  const res = await POST(postReq({ name: "Mary Poppins" }), ctx(P1));
  expect(res.status).toBe(201);
  expect(createRole).toHaveBeenCalledWith({ productionId: P1, name: "Mary Poppins", isEnsemble: false });
});

test("POST passes isEnsemble to createRole", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  createRole.mockResolvedValue({ id: "r9", name: "Villagers", is_ensemble: true });
  const res = await POST(postReq({ name: "Villagers", isEnsemble: true }), ctx(P1));
  expect(res.status).toBe(201);
  expect(createRole).toHaveBeenCalledWith({ productionId: P1, name: "Villagers", isEnsemble: true });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  createRole.mockRejectedValue(new ValidationError("Role name is required"));
  const res = await POST(postReq({ name: "" }), ctx(P1));
  expect(res.status).toBe(400);
});

test("POST with names[] bulk-creates roles (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  createRoles.mockResolvedValue([
    { id: "r1", name: "Hamlet" },
    { id: "r2", name: "Ophelia" },
  ]);
  const res = await POST(postReq({ names: ["Hamlet", "Ophelia"] }), ctx(P1));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ roles: [{ id: "r1", name: "Hamlet" }, { id: "r2", name: "Ophelia" }] });
  expect(createRoles).toHaveBeenCalledWith({ productionId: P1, names: ["Hamlet", "Ophelia"] });
  expect(createRole).not.toHaveBeenCalled();
});

test("POST still creates a single role when given name", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  createRole.mockResolvedValue({ id: "r9", name: "Solo" });
  const res = await POST(postReq({ name: "Solo" }), ctx(P1));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ role: { id: "r9", name: "Solo" } });
  expect(createRoles).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID production id without touching data", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  const res = await GET(new Request("http://test"), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  const res = await POST(postReq({ name: "Solo" }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
