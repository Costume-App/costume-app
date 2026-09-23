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
const canAssignMakerToProduction = vi.fn();
vi.mock("@/lib/data/billing", () => ({
  canAssignMakerToProduction: (...a: unknown[]) => canAssignMakerToProduction(...a),
}));

import { PUT } from "@/app/api/productions/[id]/pieces/route";

const P1 = "11111111-1111-4111-8111-111111111111";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) =>
  new Request("http://t", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertCastingInProduction, listCostumeDesigns, listCostumePieces, upsertPieceSource, canAssignMakerToProduction].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertCastingInProduction.mockResolvedValue(undefined);
  listCostumeDesigns.mockResolvedValue([{ id: "d1" }]);
  canAssignMakerToProduction.mockResolvedValue({ allowed: true });
});

test("PUT upserts a piece source (200)", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "on_hand" });
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "on_hand" }), ctx(P1));
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ designId: "d1", castingId: "c1", source: "on_hand", sharedWithCastingId: null, sourceNote: null }),
  );
});

test("PUT 400 on unknown source", async () => {
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "borrow" }), ctx(P1));
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 when design not in production", async () => {
  listCostumeDesigns.mockResolvedValue([{ id: "dX" }]);
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "make" }), ctx(P1));
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
    ctx(P1),
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
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on non-boolean made", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", made: "yes" }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT forwards makerId to upsertPieceSource", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make", maker_id: "m1" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", sourceNote: "assigned", makerId: "m1" }),
    ctx(P1),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ makerId: "m1" }),
  );
});

test("PUT 400 on non-string makerId", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", makerId: 42 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT forwards purchasePrice", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "purchase" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "purchase", purchasePrice: 45 }),
    ctx(P1),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ source: "purchase", purchasePrice: 45 }),
  );
});

test("PUT 400 on negative purchasePrice", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "purchase", purchasePrice: -5 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT forwards skirtLengthIn", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", skirtLengthIn: 22 }),
    ctx(P1),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ skirtConstruction: "full_circle", skirtLengthIn: 22 }),
  );
});

test("PUT 400 on skirtFullness of 0 (not just negative)", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "gathered", skirtFullness: 0 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on negative skirtFullness", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "gathered", skirtFullness: -2 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on skirtLengthIn of 0", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", skirtLengthIn: 0 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on negative skirtLengthIn", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", skirtLengthIn: -5 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT forwards calculatedYardage", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", calculatedYardage: 4.75 }),
    ctx(P1),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalledWith(
    expect.objectContaining({ skirtConstruction: "full_circle", calculatedYardage: 4.75 }),
  );
});

test("PUT 400 on calculatedYardage of 0", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", calculatedYardage: 0 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT 400 on negative calculatedYardage", async () => {
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", skirtConstruction: "full_circle", calculatedYardage: -1 }),
    ctx(P1),
  );
  expect(res.status).toBe(400);
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT blocks assigning a maker beyond the cap with 402 needs_seat", async () => {
  canAssignMakerToProduction.mockResolvedValue({ allowed: false, reason: "needs_seat" });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", makerId: "m4" }),
    ctx(P1),
  );
  expect(res.status).toBe(402);
  expect((await res.json()).reason).toBe("needs_seat");
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("PUT allows assigning a maker within the cap", async () => {
  upsertPieceSource.mockResolvedValue({ id: "pp1", source: "make", maker_id: "m1" });
  canAssignMakerToProduction.mockResolvedValue({ allowed: true });
  const res = await PUT(
    put({ designId: "d1", castingId: "c1", source: "make", makerId: "m1" }),
    ctx(P1),
  );
  expect(res.status).toBe(200);
  expect(upsertPieceSource).toHaveBeenCalled();
});

test("PUT returns 404 for a non-UUID production id without touching data", async () => {
  const res = await PUT(put({ designId: "d1", castingId: "c1", source: "on_hand" }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
