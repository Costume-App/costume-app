import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

// A chainable Supabase mock: every builder method returns the same chain, the
// chain is awaitable (thenable) and resolves to a settable result, and the
// single/maybeSingle terminals resolve to the same result.
const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "delete", "eq", "order"]) {
  chain[m] = vi.fn(() => chain as unknown as typeof chain);
}
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
// Supabase's builder always RESOLVES to { data, error } (it doesn't reject on a
// query error); the data layer reads `error` off that object. So resolving the
// `result` (mutated per-test, read here at call time) faithfully drives both the
// happy path and the `if (error) throw` path.
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_table: string) => chain);
function setResult(data: unknown, error: unknown = null) {
  result.data = data;
  result.error = error;
}

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listFabricWidths,
  createFabricWidth,
  updateFabricWidth,
  deleteFabricWidth,
  listFabricSuppliers,
  createFabricSupplier,
  updateFabricSupplier,
} from "@/lib/data/fabric-settings";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("listFabricWidths filters by org, oldest-first", async () => {
  setResult([{ id: "w1", org_id: "org_1", value: '54\"', is_default: true }]);
  const rows = await listFabricWidths("org_1");
  expect(from).toHaveBeenCalledWith("fabric_widths");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "w1", org_id: "org_1", value: '54\"', is_default: true }]);
});

test("createFabricWidth inserts a trimmed value scoped to the org", async () => {
  setResult({ id: "w2", org_id: "org_1", value: '60\"', is_default: false });
  const row = await createFabricWidth("org_1", { value: '  60\"  ', isDefault: false });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", value: '60\"', is_default: false });
  expect(row.id).toBe("w2");
});

test("createFabricWidth rejects an empty value", async () => {
  await expect(createFabricWidth("org_1", { value: "  ", isDefault: false })).rejects.toBeInstanceOf(ValidationError);
});

test("createFabricWidth with isDefault clears the prior default first", async () => {
  setResult({ id: "w3", value: '45\"', is_default: true });
  await createFabricWidth("org_1", { value: '45\"', isDefault: true });
  expect(chain.update).toHaveBeenCalledWith({ is_default: false });
  expect(chain.eq).toHaveBeenCalledWith("is_default", true);
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", value: '45\"', is_default: true });
});

test("updateFabricWidth patches value scoped by id and org", async () => {
  setResult({ id: "w1", value: '50\"', is_default: false });
  const row = await updateFabricWidth("org_1", "w1", { value: '50\"' });
  expect(chain.update).toHaveBeenCalledWith({ value: '50\"' });
  expect(chain.eq).toHaveBeenCalledWith("id", "w1");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(row.value).toBe('50\"');
});

test("updateFabricWidth with isDefault:true clears the prior default then sets its own", async () => {
  setResult({ id: "w1", value: '54\"', is_default: true });
  await updateFabricWidth("org_1", "w1", { isDefault: true });
  expect(chain.update).toHaveBeenCalledWith({ is_default: false }); // clearDefault pass
  expect(chain.update).toHaveBeenCalledWith({ is_default: true }); // the row's own update
});

test("updateFabricWidth with isDefault:false does not run the clear-default pass", async () => {
  setResult({ id: "w1", value: '54\"', is_default: false });
  await updateFabricWidth("org_1", "w1", { isDefault: false });
  expect(chain.update).toHaveBeenCalledWith({ is_default: false });
  // clearDefault is the only path that scopes by ("is_default", true) — never hit here
  expect(chain.eq).not.toHaveBeenCalledWith("is_default", true);
});

test("updateFabricSupplier with isDefault:true clears the prior default first", async () => {
  setResult({ id: "s1", name: "Mood", price_per_yard: 4, is_default: true });
  await updateFabricSupplier("org_1", "s1", { isDefault: true });
  expect(chain.update).toHaveBeenCalledWith({ is_default: false }); // clearDefault pass
  expect(chain.eq).toHaveBeenCalledWith("is_default", true);
  expect(chain.update).toHaveBeenCalledWith({ is_default: true });
});

test("updateFabricSupplier patches price scoped by id and org", async () => {
  setResult({ id: "s1", name: "Mood", price_per_yard: 5, is_default: false });
  await updateFabricSupplier("org_1", "s1", { pricePerYard: 5 });
  expect(chain.update).toHaveBeenCalledWith({ price_per_yard: 5 });
  expect(chain.eq).toHaveBeenCalledWith("id", "s1");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
});

test("listFabricWidths propagates a DB error", async () => {
  setResult(null, { message: "boom" });
  await expect(listFabricWidths("org_1")).rejects.toThrow("boom");
});

test("updateFabricWidth throws NotFound when the row is missing", async () => {
  setResult(null);
  await expect(updateFabricWidth("org_1", "missing", { value: '50\"' })).rejects.toBeInstanceOf(NotFoundError);
});

test("deleteFabricWidth scopes by id and org", async () => {
  setResult(null);
  await deleteFabricWidth("org_1", "w1");
  expect(from).toHaveBeenCalledWith("fabric_widths");
  expect(chain.delete).toHaveBeenCalled();
  expect(chain.eq).toHaveBeenCalledWith("id", "w1");
  expect(chain.eq).toHaveBeenCalledWith("org_id", "org_1");
});

test("listFabricSuppliers reads the suppliers table", async () => {
  setResult([{ id: "s1", org_id: "org_1", name: "Mood", price_per_yard: 4, is_default: true }]);
  const rows = await listFabricSuppliers("org_1");
  expect(from).toHaveBeenCalledWith("fabric_suppliers");
  expect(rows[0].name).toBe("Mood");
});

test("createFabricSupplier inserts name + price, defaulting price to null", async () => {
  setResult({ id: "s2", org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false });
  await createFabricSupplier("org_1", { name: "  JOANN  ", pricePerYard: null, isDefault: false });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false });
});

test("createFabricSupplier rejects an empty name", async () => {
  await expect(createFabricSupplier("org_1", { name: " ", pricePerYard: 2, isDefault: false })).rejects.toBeInstanceOf(ValidationError);
});
