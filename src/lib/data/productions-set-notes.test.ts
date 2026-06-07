import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setProductionNotes } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setProductionNotes updates notes scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", notes: "call at 6" }, error: null });
  const row = await setProductionNotes("org_1", "p1", "call at 6");
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ notes: "call at 6" });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", notes: "call at 6" });
});

test("setProductionNotes stores null for an empty string", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", notes: null }, error: null });
  await setProductionNotes("org_1", "p1", "");
  expect(update).toHaveBeenCalledWith({ notes: null });
});

test("setProductionNotes throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setProductionNotes("org_1", "nope", "x")).rejects.toBeInstanceOf(NotFoundError);
});
