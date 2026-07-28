import { expect, test, vi, beforeEach } from "vitest";

const copy = vi.fn();
const remove = vi.fn();
const from = vi.fn((_bucket: string) => ({ copy, remove }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { storage: { from: (b: string) => from(b) } } }));

import { copyImage, removeImages } from "@/lib/storage";

beforeEach(() => {
  copy.mockReset();
  remove.mockReset();
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

test("removeImages throws on a storage error", async () => {
  remove.mockResolvedValue({ error: { message: "storage down" } });
  await expect(removeImages(["a.jpg"])).rejects.toThrow("storage down");
});

test("removeImages does not call storage for an empty list", async () => {
  await removeImages([]);
  expect(remove).not.toHaveBeenCalled();
});
