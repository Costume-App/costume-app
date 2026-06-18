import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "eq", "is", "in", "limit", "order"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
chain.single = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { isUnlimited, isPaidOrg, canCreateProduction, consumeProductionUnlock } from "@/lib/data/billing";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockReset();
  from.mockImplementation((_t: string) => chain);
  setResult(null, null);
  // Restore defaults for maybeSingle and then
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
});

test("isUnlimited true when comped", async () => {
  setResult({ status: "inactive", current_period_end: null, comped: true });
  expect(await isUnlimited("orgA")).toBe(true);
});

test("isUnlimited true when active and not expired", async () => {
  setResult({ status: "active", current_period_end: "2999-01-01T00:00:00Z", comped: false });
  expect(await isUnlimited("orgA")).toBe(true);
});

test("isUnlimited false when active but expired", async () => {
  setResult({ status: "active", current_period_end: "2000-01-01T00:00:00Z", comped: false });
  expect(await isUnlimited("orgA")).toBe(false);
});

test("isUnlimited false when no row", async () => {
  setResult(null);
  expect(await isUnlimited("orgA")).toBe(false);
});

test("canCreateProduction allows unlimited orgs without an unlock", async () => {
  setResult({ status: "active", current_period_end: "2999-01-01T00:00:00Z", comped: false });
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: true, unlimited: true });
});

test("canCreateProduction allows when an unbound unlock exists", async () => {
  // isUnlimited uses .maybeSingle() -> no sub row (result.data = null from beforeEach)
  // canCreateProduction then queries production_purchases via .then -> one unbound row
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) =>
    resolve({ data: [{ id: "pp1" }], error: null });
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: true, unlimited: false });
});

test("canCreateProduction blocks when no sub and no unlock", async () => {
  // isUnlimited uses .maybeSingle() -> null (no sub row)
  // canCreateProduction then queries production_purchases via .then -> empty array
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  const gate = await canCreateProduction("orgA");
  expect(gate).toEqual({ allowed: false, reason: "needs_unlock", unlimited: false });
});

test("consumeProductionUnlock binds one unbound row and returns true", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    // 1: select unbound -> [{id}], 2: update ... select -> [{id}]
    return resolve({ data: [{ id: "pp1" }], error: null });
  };
  const ok = await consumeProductionUnlock("orgA", "prod1");
  expect(ok).toBe(true);
  expect(chain.update).toHaveBeenCalledWith({ production_id: "prod1" });
});

test("consumeProductionUnlock returns false when nothing to bind", async () => {
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve({ data: [], error: null });
  expect(await consumeProductionUnlock("orgA", "prod1")).toBe(false);
});
