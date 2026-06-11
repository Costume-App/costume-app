import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqProd = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updateShowDate } from "@/lib/data/show-dates";

beforeEach(() => {
  [maybeSingle, updSelect, eqProd, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqProd.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqProd });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updateShowDate updates the date scoped by id and production", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_date: "2026-08-05" }, error: null });
  const row = await updateShowDate("p1", "s1", { show_date: "2026-08-05" });
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(update).toHaveBeenCalledWith({ show_date: "2026-08-05" });
  expect(eqId).toHaveBeenCalledWith("id", "s1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "s1", show_date: "2026-08-05" });
});

test("updateShowDate rejects an empty date with ValidationError", async () => {
  await expect(updateShowDate("p1", "s1", { show_date: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateShowDate sets a provided time", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_time: "14:00:00" }, error: null });
  await updateShowDate("p1", "s1", { show_time: "14:00" });
  expect(update).toHaveBeenCalledWith({ show_time: "14:00" });
});

test("updateShowDate coerces an empty time to null", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_time: null }, error: null });
  await updateShowDate("p1", "s1", { show_time: "" });
  expect(update).toHaveBeenCalledWith({ show_time: null });
});

test("updateShowDate throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateShowDate("p1", "nope", { show_date: "2026-08-05" })).rejects.toBeInstanceOf(NotFoundError);
});

test("updateShowDate updates a provided label", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", label: "X" }, error: null });
  await updateShowDate("p1", "s1", { label: "X" });
  expect(update).toHaveBeenCalledWith({ label: "X" });
});
