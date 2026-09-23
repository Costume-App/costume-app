import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertCastingInProduction = vi.fn();
const assertDesignInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertCastingInProduction: (...a: unknown[]) => assertCastingInProduction(...a),
  assertDesignInProduction: (...a: unknown[]) => assertDesignInProduction(...a),
}));

const addPieceToInventory = vi.fn();
vi.mock("@/lib/data/piece-to-inventory", () => ({ addPieceToInventory: (...a: unknown[]) => addPieceToInventory(...a) }));

import { POST } from "@/app/api/productions/[id]/pieces/to-inventory/route";

const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertCastingInProduction, assertDesignInProduction, addPieceToInventory].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("POST adds the piece to inventory and returns the item", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1, title: "Pippin" });
  addPieceToInventory.mockResolvedValue({ item: { id: "item1", name: "Cloak (Ana)" }, addedInventoryItemId: "item1" });

  const res = await POST(req({ designId: "d1", castingId: "c1", category: " Outerwear ", location: "Rack 3", size: "" }), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ item: { id: "item1", name: "Cloak (Ana)" }, addedInventoryItemId: "item1" });
  expect(assertCastingInProduction).toHaveBeenCalledWith(P1, "c1");
  expect(assertDesignInProduction).toHaveBeenCalledWith(P1, "d1");
  // category trimmed, blank size → null
  expect(addPieceToInventory).toHaveBeenCalledWith("org_1", P1, "d1", "c1", { category: "Outerwear", location: "Rack 3", size: null });
});

test("POST 400 when designId or castingId is missing", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  const res = await POST(req({ designId: "d1" }), ctx(P1));
  expect(res.status).toBe(400);
  expect(addPieceToInventory).not.toHaveBeenCalled();
});

test("POST 404 when the production isn't in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ designId: "d1", castingId: "c1" }), ctx(P1));
  expect(res.status).toBe(404);
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  const res = await POST(req({ designId: "d1", castingId: "c1" }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
