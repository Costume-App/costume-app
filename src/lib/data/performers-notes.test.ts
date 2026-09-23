import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqId = vi.fn(() => ({ select: updSelect }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { MAX_PERFORMER_NOTES, updatePerformerNotes } from "@/lib/data/performers";

beforeEach(() => {
  [maybeSingle, updSelect, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqId.mockReturnValue({ select: updSelect });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("trims notes and stores empty as null", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "pf1", notes: "hat" }, error: null });
  await updatePerformerNotes("pf1", "  hat  ");
  expect(from).toHaveBeenCalledWith("performers");
  expect(update).toHaveBeenCalledWith({ notes: "hat" });
  expect(eqId).toHaveBeenCalledWith("id", "pf1");
  await updatePerformerNotes("pf1", "   ");
  expect(update).toHaveBeenLastCalledWith({ notes: null });
  await updatePerformerNotes("pf1", null);
  expect(update).toHaveBeenLastCalledWith({ notes: null });
});

test("rejects notes over the cap and a missing performer", async () => {
  await expect(updatePerformerNotes("pf1", "x".repeat(MAX_PERFORMER_NOTES + 1))).rejects.toBeInstanceOf(ValidationError);
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updatePerformerNotes("nope", "x")).rejects.toBeInstanceOf(NotFoundError);
});
