import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
const assertCastingInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertCastingInProduction: (...a: unknown[]) => assertCastingInProduction(...a),
}));
const listCostumeDesigns = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({ listCostumeDesigns: (...a: unknown[]) => listCostumeDesigns(...a) }));
const listCostumePieces = vi.fn();
const upsertPieceSource = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  upsertPieceSource: (...a: unknown[]) => upsertPieceSource(...a),
}));

import { PUT } from "@/app/api/productions/[id]/pieces/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) =>
  new Request("http://t", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertCastingInProduction, listCostumeDesigns, listCostumePieces, upsertPieceSource].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertCastingInProduction.mockResolvedValue(undefined);
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
});

test("PUT upserts a piece source (200)", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "on_hand" });
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "on_hand" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ designId: "d1", castingId: "c1", source: "on_hand", sharedWithCastingId: null, sourceNote: null }),
  );
});

test("PUT 400 on unknown source", async () => {
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "borrow" }), ctx("p1"));
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 when design not in production", async () => {
  listCostumeDesigns.mockResolvedValue([{ id: "dX" }]);
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "make" }), ctx("p1"));
  expect(res.status).toBe(400);
});

test("PUT forwards fabric + made fields", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make", made: true });
  const res = await PUT(
    put({
      designId: "d1", castingId: "c1", source: "make",
      fabricType: "wool", fabricColor: "navy", fabricWidth: '60"',
      fabricSupplier: "Mood", fabricYardage: 2.5, fabricUnitCost: 10, made: true,
    }),
    ctx("p1"),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({
      designId: "d1", castingId: "c1", source: "make",
      fabricType: "wool", fabricColor: "navy", fabricWidth: '60"',
      fabricSupplier: "Mood", fabricYardage: 2.5, fabricUnitCost: 10, made: true,
    }),
  );
});

test("PUT 400 on negative yardage", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", fabricYardage: -1 }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on non-boolean made", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", made: "yes" }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT forwards makerId to upsertPieceSource", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make", maker_id: "m1" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", sourceNote: "assigned", makerId: "m1" }),
    ctx("p1"),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ makerId: "m1" }),
  );
});

test("PUT 400 on non-string makerId", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", makerId: 42 }),
    ctx("p1"),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});
