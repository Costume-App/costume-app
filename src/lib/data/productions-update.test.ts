import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updateProduction } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updateProduction updates the title scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", title: "Annie" }, error: null });
  const row = await updateProduction("org_1", "p1", "  Annie  ");
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ title: "Annie" });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", title: "Annie" });
});

test("updateProduction rejects an empty title with ValidationError", async () => {
  await expect(updateProduction("org_1", "p1", "  ")).rejects.toBeInstanceOf(ValidationError);
});

test("updateProduction throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateProduction("org_1", "nope", "X")).rejects.toBeInstanceOf(NotFoundError);
});
