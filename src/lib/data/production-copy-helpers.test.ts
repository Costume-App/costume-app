import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "eq", "order"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { getProductionByIdUnscoped } from "@/lib/data/productions";
import { insertRoleCopy } from "@/lib/data/roles";
import { insertCostumeDesignCopy } from "@/lib/data/costume-designs";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("getProductionByIdUnscoped fetches by id with no org filter", async () => {
  setResult({ id: "p1", title: "Cats" });
  const row = await getProductionByIdUnscoped("p1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(chain.eq).toHaveBeenCalledWith("id", "p1");
  expect(chain.eq).not.toHaveBeenCalledWith("org_id", expect.anything());
  expect(row).toEqual({ id: "p1", title: "Cats" });
});

test("insertRoleCopy inserts name, notes, display_order, and is_ensemble", async () => {
  setResult({ id: "r2", production_id: "p2", name: "Wizard", notes: "flowing", display_order: 3, is_ensemble: false });
  await insertRoleCopy({ productionId: "p2", name: "Wizard", notes: "flowing", displayOrder: 3, isEnsemble: false });
  expect(chain.insert).toHaveBeenCalledWith({
    production_id: "p2",
    name: "Wizard",
    notes: "flowing",
    display_order: 3,
    is_ensemble: false,
  });
});

test("insertCostumeDesignCopy inserts role, name, notes, and display_order", async () => {
  setResult({ id: "d2", production_id: "p2", role_id: "r2", name: "Cloak", notes: "lined", display_order: 1 });
  await insertCostumeDesignCopy({ productionId: "p2", roleId: "r2", name: "Cloak", notes: "lined", displayOrder: 1 });
  expect(chain.insert).toHaveBeenCalledWith({ production_id: "p2", role_id: "r2", name: "Cloak", notes: "lined", display_order: 1 });
});
