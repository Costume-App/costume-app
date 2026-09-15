import { expect, test, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn((_cols: string) => ({ eq }));
const from = vi.fn((_t: string) => ({ select }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { getPerformer } from "@/lib/data/performers";

beforeEach(() => {
  [maybeSingle, eq, select, from].forEach((m) => m.mockReset());
  eq.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
});

test("getPerformer returns the row by id", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "pf1", production_id: "p1", label: "Amy" }, error: null });
  expect(await getPerformer("pf1")).toEqual({ id: "pf1", production_id: "p1", label: "Amy" });
  expect(from).toHaveBeenCalledWith("performers");
  expect(eq).toHaveBeenCalledWith("id", "pf1");
});

test("getPerformer returns null when missing", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await getPerformer("nope")).toBeNull();
});
