import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const eqProd = vi.fn(() => ({ maybeSingle }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const select = vi.fn((_cols: string) => ({ eq: eqId }));
const from = vi.fn((_table: string) => ({ select }));
const rpc = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (...a: unknown[]) => rpc(...a) },
}));

import { setRoleEnsemble } from "@/lib/data/roles";

beforeEach(() => {
  [maybeSingle, eqProd, eqId, select, from, rpc].forEach((m) => m.mockReset());
  eqProd.mockReturnValue({ maybeSingle });
  eqId.mockReturnValue({ eq: eqProd });
  select.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ select });
});

test("setRoleEnsemble checks the role is in the production, calls the RPC, returns the updated role", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", name: "Villagers", is_ensemble: false }, error: null });
  rpc.mockResolvedValue({ error: null });
  const role = await setRoleEnsemble("p1", "r1", true);
  expect(from).toHaveBeenCalledWith("roles");
  expect(eqId).toHaveBeenCalledWith("id", "r1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(rpc).toHaveBeenCalledWith("set_role_ensemble", { p_role_id: "r1", p_is_ensemble: true });
  expect(role).toEqual({ id: "r1", name: "Villagers", is_ensemble: true });
});

test("setRoleEnsemble throws NotFoundError for a role outside the production and skips the RPC", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setRoleEnsemble("p1", "rX", true)).rejects.toBeInstanceOf(NotFoundError);
  expect(rpc).not.toHaveBeenCalled();
});

test("setRoleEnsemble surfaces an RPC error", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", is_ensemble: true }, error: null });
  rpc.mockResolvedValue({ error: { message: "boom" } });
  await expect(setRoleEnsemble("p1", "r1", false)).rejects.toThrow("boom");
});
