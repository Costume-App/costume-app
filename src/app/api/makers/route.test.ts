import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: (...a: unknown[]) => ensureOrganization(...a) }));

const listMakers = vi.fn();
const createMaker = vi.fn();
vi.mock("@/lib/data/makers", () => ({
  listMakers: (...a: unknown[]) => listMakers(...a),
  createMaker: (...a: unknown[]) => createMaker(...a),
}));

import { GET, POST } from "@/app/api/makers/route";

beforeEach(() => {
  [getAuthContext, ensureOrganization, listMakers, createMaker].forEach((m) => m.mockReset());
});

function postReq(body: unknown) {
  return new Request("http://test/api/makers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET returns makers for the org", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listMakers.mockResolvedValue([{ id: "m1", name: "Nada", color: "plum" }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ makers: [{ id: "m1", name: "Nada", color: "plum" }] });
  expect(listMakers).toHaveBeenCalledWith("org_1");
});

test("POST creates a maker (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createMaker.mockResolvedValue({ id: "m2", name: "Crystal", color: "red" });
  const res = await POST(postReq({ name: "Crystal", color: "red" }));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ maker: { id: "m2", name: "Crystal", color: "red" } });
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", expect.any(String));
  expect(createMaker).toHaveBeenCalledWith("org_1", { name: "Crystal", color: "red" });
});

test("POST 400 on empty name", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createMaker.mockRejectedValue(new ValidationError("Maker name is required"));
  const res = await POST(postReq({ name: "" }));
  expect(res.status).toBe(400);
});

test("POST 403 with no active org, never touches the DB", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(403, "No active organization"));
  const res = await POST(postReq({ name: "X" }));
  expect(res.status).toBe(403);
  expect(createMaker).not.toHaveBeenCalled();
});
