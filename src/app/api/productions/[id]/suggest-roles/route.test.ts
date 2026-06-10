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

const isAiConfigured = vi.fn();
const suggestRolesForTitle = vi.fn();
vi.mock("@/lib/ai/suggest-roles", () => ({
  isAiConfigured: () => isAiConfigured(),
  suggestRolesForTitle: (...a: unknown[]) => suggestRolesForTitle(...a),
}));

import { POST } from "@/app/api/productions/[id]/suggest-roles/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, isAiConfigured, suggestRolesForTitle].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "POST" });

test("POST returns AI-suggested roles using the production's own title", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  suggestRolesForTitle.mockResolvedValue(["Pippin", "Leading Player"]);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ title: "Pippin", roles: ["Pippin", "Leading Player"] });
  expect(suggestRolesForTitle).toHaveBeenCalledWith("Pippin");
});

test("POST 501 when AI is not configured", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(false);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(501);
  expect(suggestRolesForTitle).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(404);
});
