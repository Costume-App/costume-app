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

import { PATCH, DELETE } from "@/app/api/inventory/[itemId]/route";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

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
    id: "i1", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 2, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x", { method: "PATCH", body: JSON.stringify({ quantity: 2 }) });
  const res = await PATCH(req, ctx("i1"));
  expect(res.status).toBe(200);
  expect((await res.json()).item.quantity).toBe(2);
  expect(updateInventoryItem).toHaveBeenCalledWith("org_1", "i1", { quantity: 2 });
});

test("DELETE removes storage objects then the item", async () => {
  vi.mocked(getInventoryItem).mockResolvedValue({
    id: "i1", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  vi.mocked(listInventoryItemImages).mockResolvedValue([
    { id: "im1", inventory_item_id: "i1", storage_path: "inventory/i1/a.jpg", created_at: "" },
  ]);
  const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("i1"));
  expect(res.status).toBe(200);
  expect(removeImages).toHaveBeenCalledWith(["inventory/i1/a.jpg"]);
  expect(deleteInventoryItem).toHaveBeenCalledWith("org_1", "i1");
});
