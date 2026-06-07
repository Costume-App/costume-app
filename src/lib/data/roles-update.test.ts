import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqProd = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updateRole } from "@/lib/data/roles";

beforeEach(() => {
  [maybeSingle, updSelect, eqProd, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqProd.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqProd });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updateRole updates the name scoped by id and production", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", name: "Bert" }, error: null });
  const row = await updateRole("p1", "r1", "  Bert  ");
  expect(from).toHaveBeenCalledWith("roles");
  expect(update).toHaveBeenCalledWith({ name: "Bert" });
  expect(eqId).toHaveBeenCalledWith("id", "r1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "r1", name: "Bert" });
});

test("updateRole rejects an empty name with ValidationError", async () => {
  await expect(updateRole("p1", "r1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("updateRole throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateRole("p1", "nope", "X")).rejects.toBeInstanceOf(NotFoundError);
});
