import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setProductionActive } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setProductionActive updates is_active scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", title: "Annie", is_active: false }, error: null });
  const row = await setProductionActive("org_1", "p1", false);
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ is_active: false });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", title: "Annie", is_active: false });
});

test("setProductionActive throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setProductionActive("org_1", "nope", true)).rejects.toBeInstanceOf(NotFoundError);
});
