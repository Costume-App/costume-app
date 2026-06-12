import { expect, test, vi, beforeEach } from "vitest";

const copy = vi.fn();
const from = vi.fn((_bucket: string) => ({ copy }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { storage: { from: (b: string) => from(b) } } }));

import { copyImage } from "@/lib/storage";

beforeEach(() => {
  copy.mockReset();
  from.mockClear();
});

test("copyImage copies within the role-images bucket", async () => {
  copy.mockResolvedValue({ error: null });
  await copyImage("p1/designs/d1/a.jpg", "inventory/i1/x.jpg");
  expect(from).toHaveBeenCalledWith("role-images");
  expect(copy).toHaveBeenCalledWith("p1/designs/d1/a.jpg", "inventory/i1/x.jpg");
});

test("copyImage throws on a storage error", async () => {
  copy.mockResolvedValue({ error: { message: "nope" } });
  await expect(copyImage("a", "b")).rejects.toThrow("nope");
});
