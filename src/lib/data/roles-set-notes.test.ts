import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqProd = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setRoleNotes } from "@/lib/data/roles";

beforeEach(() => {
  [maybeSingle, updSelect, eqProd, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqProd.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqProd });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setRoleNotes updates notes scoped by id and production", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", notes: "blue dress" }, error: null });
  const row = await setRoleNotes("p1", "r1", "blue dress");
  expect(from).toHaveBeenCalledWith("roles");
  expect(update).toHaveBeenCalledWith({ notes: "blue dress" });
  expect(eqId).toHaveBeenCalledWith("id", "r1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "r1", notes: "blue dress" });
});

test("setRoleNotes stores null for an empty string", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", notes: null }, error: null });
  await setRoleNotes("p1", "r1", "");
  expect(update).toHaveBeenCalledWith({ notes: null });
});

test("setRoleNotes throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setRoleNotes("p1", "nope", "x")).rejects.toBeInstanceOf(NotFoundError);
});
