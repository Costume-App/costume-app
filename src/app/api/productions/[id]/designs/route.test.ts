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
const listCostumeDesigns = vi.fn();
const createCostumeDesign = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({
  listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a),
  createCostumeDesign: (...a: unknown[]) => createCostumeDesign(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/designs/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listCostumeDesigns, createCostumeDesign].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

test("GET lists designs (200)", async () => {
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
  const res = await GET(new Request("http://t"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ designs: [{ id: "d1" }] });
});

test("POST creates a design (201)", async () => {
  createCostumeDesign.mockResolvedValue({ id: "d1", name: "Jacket" });
  const res = await POST(post({ roleId: "r1", name: "Jacket" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(createCostumeDesign).toHaveBeenCalledWith({ productionId: "p1", roleId: "r1", name: "Jacket" });
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(post({ roleId: "r1", name: "X" }), ctx("p1"));
  expect(res.status).toBe(404);
});
