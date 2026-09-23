import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/inventory-items", () => ({
  getInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
}));
vi.mock("@/lib/data/inventory-item-images", () => ({ listInventoryItemImages: vi.fn(async () => []) }));
vi.mock("@/lib/storage", () => ({ removeImages: vi.fn(async () => {}) }));

import { GET, PATCH, DELETE } from "@/app/api/inventory/[itemId]/route";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

const I1 = "11111111-1111-4111-8111-111111111111";
const I2 = "22222222-2222-4222-8222-222222222222";

const ctx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

beforeEach(() => {
  vi.mocked(getInventoryItem).mockReset();
  vi.mocked(updateInventoryItem).mockReset();
  vi.mocked(deleteInventoryItem).mockReset();
  vi.mocked(listInventoryItemImages).mockReset().mockResolvedValue([]);
  vi.mocked(removeImages).mockReset();
});

test("PATCH updates and returns the item", async () => {
  vi.mocked(updateInventoryItem).mockResolvedValue({
    id: I1, org_id: "org_1", name: "Cape", category: null, size: null, quantity: 2, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ quantity: 2 }) });
  const res = await PATCH(req, ctx(I1));
  expect(res.status).toBe(200);
  expect((await res.json()).item.quantity).toBe(2);
  expect(updateInventoryItem).toHaveBeenCalledWith("org_1", I1, { quantity: 2 });
});

test("PATCH clears a nullable field when sent null", async () => {
  vi.mocked(updateInventoryItem).mockResolvedValue({
    id: I1, org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ category: null, notes: null }) });
  const res = await PATCH(req, ctx(I1));
  expect(res.status).toBe(200);
  expect(updateInventoryItem).toHaveBeenCalledWith("org_1", I1, { category: null, notes: null });
});

test("DELETE removes storage objects then the item", async () => {
  vi.mocked(getInventoryItem).mockResolvedValue({
    id: I1, org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  vi.mocked(listInventoryItemImages).mockResolvedValue([
    { id: "im1", inventory_item_id: I1, storage_path: `inventory/${I1}/a.jpg`, created_at: "" },
  ]);
  const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx(I1));
  expect(res.status).toBe(200);
  expect(removeImages).toHaveBeenCalledWith([`inventory/${I1}/a.jpg`]);
  expect(deleteInventoryItem).toHaveBeenCalledWith("org_1", I1);
});

test("GET returns the item", async () => {
  vi.mocked(getInventoryItem).mockResolvedValue({
    id: I1, org_id: "org_1", name: "Top hat", category: "Hats", size: "M",
    quantity: 2, location: "Bin A", notes: null, created_at: "",
  });
  const res = await GET(new Request("http://x"), ctx(I1));
  expect(res.status).toBe(200);
  expect((await res.json()).item.name).toBe("Top hat");
  expect(getInventoryItem).toHaveBeenCalledWith("org_1", I1);
});

test("GET 404 when the item is not in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  vi.mocked(getInventoryItem).mockRejectedValue(new NotFoundError("Inventory item not found"));
  const res = await GET(new Request("http://x"), ctx(I2));
  expect(res.status).toBe(404);
});

test("GET returns 404 for a non-UUID item id without touching data", async () => {
  const res = await GET(new Request("http://x"), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(getInventoryItem).not.toHaveBeenCalled();
});
