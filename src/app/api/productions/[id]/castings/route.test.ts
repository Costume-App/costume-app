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

const addCastMember = vi.fn();
vi.mock("@/lib/data/castings", () => ({
  addCastMember: (...a: unknown[]) => addCastMember(...a),
}));

import { POST } from "@/app/api/productions/[id]/castings/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, addCastMember].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postReq = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq({ roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(404);
});

test("POST adds a cast member (201) and returns performer + casting", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  addCastMember.mockResolvedValue({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
  const res = await POST(postReq({ roleId: "r1", name: "Ava", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addCastMember).toHaveBeenCalledWith({
    productionId: "p1",
    roleId: "r1",
    name: "Ava",
    assignment: "primary",
  });
  expect(await res.json()).toEqual({
    performer: { id: "pf9", label: "Ava" },
    casting: { id: "c9", role_id: "r1", performer_id: "pf9", assignment: "primary" },
  });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  addCastMember.mockRejectedValue(new ValidationError("Performer name is required"));
  const res = await POST(postReq({ roleId: "r1", name: "", assignment: "primary" }), ctx("p1"));
  expect(res.status).toBe(400);
});
