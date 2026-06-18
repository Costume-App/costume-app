import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert", "update", "eq", "order"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
chain.maybeSingle = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

const getProductionByIdUnscoped = vi.fn();
vi.mock("@/lib/data/productions", () => ({ getProductionByIdUnscoped: (...a: unknown[]) => getProductionByIdUnscoped(...a) }));
const listRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({ listRoles: (...a: unknown[]) => listRoles(...a) }));
const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));
const copyDesignLayer = vi.fn();
vi.mock("@/lib/data/production-copy", () => ({ copyDesignLayer: (...a: unknown[]) => copyDesignLayer(...a) }));

import {
  createProductionShare, getShareByToken, listSharesForProduction, revokeShare, acceptProductionShare,
} from "@/lib/data/production-shares";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  [from, getProductionByIdUnscoped, listRoles, listCostumeDesigns, copyDesignLayer].forEach((m) => m.mockReset?.());
  from.mockImplementation((_t: string) => chain);
  setResult(null, null);
});

test("createProductionShare inserts a pending row with a token", async () => {
  setResult({ id: "s1", token: "abc", status: "pending" });
  await createProductionShare({ sourceProductionId: "p1", sourceOrgId: "orgA", userId: "u1", recipientEmail: "x@y.com" });
  expect(from).toHaveBeenCalledWith("production_shares");
  expect(chain.insert).toHaveBeenCalledWith(
    expect.objectContaining({ source_production_id: "p1", source_org_id: "orgA", created_by: "u1", recipient_email: "x@y.com", token: expect.any(String) }),
  );
});

test("getShareByToken returns the share plus a source summary", async () => {
  setResult({ id: "s1", source_production_id: "p1", token: "abc", status: "pending" });
  getProductionByIdUnscoped.mockResolvedValue({ id: "p1", title: "Cats" });
  listRoles.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
  const out = await getShareByToken("abc");
  expect(out?.source).toEqual({ title: "Cats", roleCount: 2, designCount: 1 });
});

test("getShareByToken returns null for an unknown token", async () => {
  setResult(null);
  expect(await getShareByToken("nope")).toBeNull();
});

test("listSharesForProduction filters by source production, newest first", async () => {
  setResult([{ id: "s1" }]);
  await listSharesForProduction("p1");
  expect(chain.eq).toHaveBeenCalledWith("source_production_id", "p1");
  expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
});

test("revokeShare updates status scoped by id, production, and pending", async () => {
  setResult(null);
  await revokeShare("p1", "s1");
  expect(chain.update).toHaveBeenCalledWith({ status: "revoked" });
  expect(chain.eq).toHaveBeenCalledWith("id", "s1");
  expect(chain.eq).toHaveBeenCalledWith("source_production_id", "p1");
  expect(chain.eq).toHaveBeenCalledWith("status", "pending");
});

test("acceptProductionShare copies the design layer and marks the share accepted", async () => {
  setResult({ id: "s1", source_production_id: "p1", status: "pending" });
  copyDesignLayer.mockResolvedValue({ productionId: "p2" });
  const out = await acceptProductionShare({ token: "abc", recipientOrgId: "orgB", userId: "u1" });
  expect(copyDesignLayer).toHaveBeenCalledWith({ sourceProductionId: "p1", targetOrgId: "orgB", userId: "u1" });
  expect(chain.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "accepted", accepted_by_org_id: "orgB", accepted_production_id: "p2" }),
  );
  expect(out).toEqual({ productionId: "p2" });
});

test("acceptProductionShare rejects an already-accepted token without copying", async () => {
  const { ValidationError } = await import("@/lib/errors");
  setResult({ id: "s1", source_production_id: "p1", status: "accepted" });
  await expect(acceptProductionShare({ token: "abc", recipientOrgId: "orgB", userId: "u1" })).rejects.toBeInstanceOf(ValidationError);
  expect(copyDesignLayer).not.toHaveBeenCalled();
});

test("acceptProductionShare rejects an unknown token", async () => {
  const { ValidationError } = await import("@/lib/errors");
  setResult(null);
  await expect(acceptProductionShare({ token: "nope", recipientOrgId: "orgB", userId: "u1" })).rejects.toBeInstanceOf(ValidationError);
});
