import { expect, test, vi, beforeEach } from "vitest";

const inFn = vi.fn();
const select = vi.fn(() => ({ in: inFn }));
const from = vi.fn((_t: string) => ({ select }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { roleIdsWithImages } from "@/lib/data/role-images";

beforeEach(() => {
  [inFn, select, from].forEach((m) => m.mockReset());
  select.mockReturnValue({ in: inFn });
  from.mockReturnValue({ select });
});

test("roleIdsWithImages returns [] without querying for empty input", async () => {
  expect(await roleIdsWithImages([])).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test("roleIdsWithImages returns distinct role ids that have images", async () => {
  inFn.mockResolvedValue({ data: [{ role_id: "r1" }, { role_id: "r1" }, { role_id: "r2" }], error: null });
  const ids = await roleIdsWithImages(["r1", "r2", "r3"]);
  expect(from).toHaveBeenCalledWith("role_images");
  expect(select).toHaveBeenCalledWith("role_id");
  expect(inFn).toHaveBeenCalledWith("role_id", ["r1", "r2", "r3"]);
  expect(ids.sort()).toEqual(["r1", "r2"]);
});
