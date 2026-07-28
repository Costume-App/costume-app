import { expect, test, vi, beforeEach } from "vitest";

const inFn = vi.fn();
const eqFn = vi.fn();
const select = vi.fn();
const from = vi.fn((_t: string) => ({ select }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listProductionImagePaths,
  listRoleImagePaths,
  listDesignImagePaths,
} from "@/lib/data/storage-paths";

beforeEach(() => {
  [inFn, eqFn, select, from].forEach((m) => m.mockReset());
  select.mockReturnValue({ in: inFn, eq: eqFn });
  from.mockReturnValue({ select });
});

test("listRoleImagePaths returns the role's storage paths", async () => {
  inFn.mockResolvedValue({ data: [{ storage_path: "p1/r1/a.jpg" }], error: null });
  const paths = await listRoleImagePaths("r1");
  expect(from).toHaveBeenCalledWith("role_images");
  expect(inFn).toHaveBeenCalledWith("role_id", ["r1"]);
  expect(paths).toEqual(["p1/r1/a.jpg"]);
});

test("listDesignImagePaths returns the design's storage paths", async () => {
  inFn.mockResolvedValue({ data: [{ storage_path: "p1/designs/d1/a.jpg" }], error: null });
  const paths = await listDesignImagePaths("d1");
  expect(from).toHaveBeenCalledWith("costume_design_images");
  expect(inFn).toHaveBeenCalledWith("costume_design_id", ["d1"]);
  expect(paths).toEqual(["p1/designs/d1/a.jpg"]);
});

test("listProductionImagePaths gathers both role and design images", async () => {
  eqFn
    .mockResolvedValueOnce({ data: [{ id: "r1" }], error: null })        // roles
    .mockResolvedValueOnce({ data: [{ id: "d1" }], error: null });       // costume_designs
  inFn
    .mockResolvedValueOnce({ data: [{ storage_path: "p1/r1/a.jpg" }], error: null })
    .mockResolvedValueOnce({ data: [{ storage_path: "p1/designs/d1/b.jpg" }], error: null });

  const paths = await listProductionImagePaths("p1");

  expect(from).toHaveBeenCalledWith("roles");
  expect(from).toHaveBeenCalledWith("costume_designs");
  expect(paths.sort()).toEqual(["p1/designs/d1/b.jpg", "p1/r1/a.jpg"]);
});

test("listProductionImagePaths skips the image queries when a production has no roles or designs", async () => {
  eqFn
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  const paths = await listProductionImagePaths("p1");
  expect(paths).toEqual([]);
  // An empty `.in()` would match nothing but still costs a round trip.
  expect(inFn).not.toHaveBeenCalled();
});

test("listRoleImagePaths throws on a query error", async () => {
  inFn.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listRoleImagePaths("r1")).rejects.toThrow("boom");
});
