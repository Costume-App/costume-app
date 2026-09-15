import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqId = vi.fn(() => ({ select: updSelect }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updatePerformer } from "@/lib/data/performers";

beforeEach(() => {
  [maybeSingle, updSelect, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqId.mockReturnValue({ select: updSelect });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updatePerformer updates the label scoped by id", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "pf1", label: "Jane Banks" }, error: null });
  const row = await updatePerformer("pf1", "  Jane Banks  ");
  expect(from).toHaveBeenCalledWith("performers");
  expect(update).toHaveBeenCalledWith({ label: "Jane Banks" });
  expect(eqId).toHaveBeenCalledWith("id", "pf1");
  expect(row).toEqual({ id: "pf1", label: "Jane Banks" });
});

test("updatePerformer rejects an empty label with ValidationError", async () => {
  await expect(updatePerformer("pf1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("updatePerformer throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updatePerformer("nope", "X")).rejects.toBeInstanceOf(NotFoundError);
});

test("updatePerformer rejects a name over 100 characters", async () => {
  await expect(updatePerformer("pf1", "x".repeat(101))).rejects.toBeInstanceOf(ValidationError);
  expect(update).not.toHaveBeenCalled();
});
