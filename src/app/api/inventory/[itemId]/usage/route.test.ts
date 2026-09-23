import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const getInventoryItem = vi.fn();
const listInventoryUsage = vi.fn();
const listInventoryMadeFor = vi.fn();
vi.mock("@/lib/data/inventory-items", () => ({
  getInventoryItem: (...a: unknown[]) => getInventoryItem(...a),
  listInventoryUsage: (...a: unknown[]) => listInventoryUsage(...a),
  listInventoryMadeFor: (...a: unknown[]) => listInventoryMadeFor(...a),
}));

import { GET } from "@/app/api/inventory/[itemId]/usage/route";

const I1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  [getAuthContext, getInventoryItem, listInventoryUsage, listInventoryMadeFor].forEach((m) => m.mockReset());
});

const ctx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

test("GET returns both usage and madeFor for the item", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  getInventoryItem.mockResolvedValue({ id: I1 });
  listInventoryUsage.mockResolvedValue([{ productionName: "Hamlet", roleName: "Ophelia" }]);
  listInventoryMadeFor.mockResolvedValue([{ productionName: "Pippin", roleName: "Lead" }]);

  const res = await GET(new Request("http://test"), ctx(I1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    usage: [{ productionName: "Hamlet", roleName: "Ophelia" }],
    madeFor: [{ productionName: "Pippin", roleName: "Lead" }],
  });
  expect(getInventoryItem).toHaveBeenCalledWith("org_1", I1);
  expect(listInventoryMadeFor).toHaveBeenCalledWith(I1);
});

test("GET 404 when the item isn't in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  getInventoryItem.mockRejectedValue(new NotFoundError("Item not found"));

  const res = await GET(new Request("http://test"), ctx(I1));
  expect(res.status).toBe(404);
  expect(listInventoryMadeFor).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID item id without touching data", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  const res = await GET(new Request("http://test"), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(getInventoryItem).not.toHaveBeenCalled();
});
