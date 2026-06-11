import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setCostumesDue } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setCostumesDue updates costumes_due_date scoped by id + org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", costumes_due_date: "2026-11-01" }, error: null });
  const row = await setCostumesDue("org_1", "p1", "2026-11-01");
  expect(update).toHaveBeenCalledWith({ costumes_due_date: "2026-11-01" });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", costumes_due_date: "2026-11-01" });
});

test("setCostumesDue stores null for a blank or null date", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", costumes_due_date: null }, error: null });
  await setCostumesDue("org_1", "p1", "");
  expect(update).toHaveBeenCalledWith({ costumes_due_date: null });
});

test("setCostumesDue throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setCostumesDue("org_1", "nope", "2026-11-01")).rejects.toBeInstanceOf(NotFoundError);
});
