import { expect, test, vi, beforeEach } from "vitest";

const eqOrg = vi.fn();
const eqId = vi.fn(() => ({ eq: eqOrg }));
const del = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_table: string) => ({ delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { deleteProduction } from "@/lib/data/productions";

beforeEach(() => {
  [eqOrg, eqId, del, from].forEach((m) => m.mockReset());
  eqId.mockReturnValue({ eq: eqOrg });
  del.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ delete: del });
});

test("deleteProduction deletes the row scoped by id and org", async () => {
  eqOrg.mockResolvedValue({ error: null });
  await deleteProduction("org_1", "p1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
});

test("deleteProduction throws on supabase error", async () => {
  eqOrg.mockResolvedValue({ error: { message: "delete failed" } });
  await expect(deleteProduction("org_1", "p1")).rejects.toThrow("delete failed");
});
