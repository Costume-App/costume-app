import { expect, test, vi, beforeEach } from "vitest";

const eqCount = vi.fn();
const selectCount = vi.fn(() => ({ eq: eqCount }));
const from = vi.fn((_t: string) => ({ select: selectCount }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { countRoleImages } from "@/lib/data/role-images";

beforeEach(() => {
  [eqCount, selectCount, from].forEach((m) => m.mockReset());
  selectCount.mockReturnValue({ eq: eqCount });
  from.mockReturnValue({ select: selectCount });
});

test("countRoleImages returns the exact head count for the role", async () => {
  eqCount.mockResolvedValue({ count: 3, error: null });
  const n = await countRoleImages("r1");
  expect(from).toHaveBeenCalledWith("role_images");
  expect(selectCount).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(eqCount).toHaveBeenCalledWith("role_id", "r1");
  expect(n).toBe(3);
});

test("countRoleImages treats a null count as 0", async () => {
  eqCount.mockResolvedValue({ count: null, error: null });
  expect(await countRoleImages("r1")).toBe(0);
});
