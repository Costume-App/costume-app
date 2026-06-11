import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: vi.fn(async () => {}) }));
vi.mock("@/lib/data/inventory-items", () => ({
  listInventoryItems: vi.fn(),
  createInventoryItem: vi.fn(),
}));
vi.mock("@/lib/data/inventory-item-images", () => ({ firstImagePaths: vi.fn(async () => ({})) }));
vi.mock("@/lib/storage", () => ({ signImageUrls: vi.fn(async () => ({})) }));

import { GET, POST } from "@/app/api/inventory/route";
import { listInventoryItems, createInventoryItem } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";

beforeEach(() => {
  vi.mocked(listInventoryItems).mockReset();
  vi.mocked(createInventoryItem).mockReset();
  vi.mocked(firstImagePaths).mockReset().mockResolvedValue({});
  vi.mocked(signImageUrls).mockReset().mockResolvedValue({});
});

test("GET returns items with signed thumbnail urls", async () => {
  vi.mocked(listInventoryItems).mockResolvedValue([
    { id: "i1", org_id: "org_1", name: "Hat", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "" },
  ]);
  vi.mocked(firstImagePaths).mockResolvedValue({ i1: "inventory/i1/a.jpg" });
  vi.mocked(signImageUrls).mockResolvedValue({ "inventory/i1/a.jpg": "https://signed/a" });
  const res = await GET();
  const body = await res.json();
  expect(body.items[0]).toMatchObject({ id: "i1", name: "Hat", thumbUrl: "https://signed/a" });
});

test("POST creates an item and returns 201", async () => {
  vi.mocked(createInventoryItem).mockResolvedValue({
    id: "i2", org_id: "org_1", name: "Cape", category: null, size: null, quantity: 1, location: null, notes: null, created_at: "",
  });
  const req = new Request("http://x/api/inventory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cape" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(201);
  expect((await res.json()).item.id).toBe("i2");
  expect(createInventoryItem).toHaveBeenCalledWith("org_1", expect.objectContaining({ name: "Cape" }));
});
