import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const loadCostumeCreationsData = vi.fn();
vi.mock("@/lib/data/costume-creations", () => ({
  loadCostumeCreationsData: (...a: unknown[]) => loadCostumeCreationsData(...a),
}));

const listCostumePieces = vi.fn();
const upsertPieceSource = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  upsertPieceSource: (...a: unknown[]) => upsertPieceSource(...a),
}));

const isAiConfigured = vi.fn();
const estimateFabricYardage = vi.fn();
vi.mock("@/lib/ai/estimate-fabric", () => ({
  isAiConfigured: () => isAiConfigured(),
  estimateFabricYardage: (...a: unknown[]) => estimateFabricYardage(...a),
}));

import { POST } from "@/app/api/productions/[id]/estimate-fabric/route";
import type { PieceRow } from "@/lib/tailor-summary";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadCostumeCreationsData, listCostumePieces, upsertPieceSource, isAiConfigured, estimateFabricYardage].forEach(
    (m) => m.mockReset(),
  );
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "POST" });

const piece = (over: Partial<PieceRow> = {}): PieceRow => ({
  costume_design_id: "d1",
  casting_id: "c1",
  source: "make",
  fabric_type: null,
  fabric_color: null,
  fabric_width: null,
  fabric_supplier: null,
  fabric_yardage: null,
  fabric_unit_cost: null,
  made: false,
  maker_id: null,
  ...over,
});

const dataWith = (initialPieces: PieceRow[]) => ({
  roles: [{ id: "r1", name: "Lead", notes: null }],
  designs: [{ id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null }],
  castings: [{ id: "c1", cast_id: "cast1", role_id: "r1", performer_id: "pf1", assignment: "primary" }],
  performers: [{ id: "pf1", name: "Ana" }],
  casts: [{ id: "cast1", name: "Cast A" }],
  initialPieces,
  measurementsByCasting: { c1: [{ key: "height", label: "Height", value: 70, unit: "in" }] },
});

test("estimates only make-items missing a yardage and persists each via upsertPieceSource", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(dataWith([]));
  estimateFabricYardage.mockResolvedValue(new Map([["c1:d1", 3.5]]));
  upsertPieceSource.mockResolvedValue(piece({ fabric_yardage: 3.5 }));
  const refreshed = [piece({ fabric_yardage: 3.5 })];
  listCostumePieces.mockResolvedValue(refreshed);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: refreshed, estimated: 1 });

  expect(estimateFabricYardage).toHaveBeenCalledWith([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: null,
      measurements: [{ label: "Height", value: 70, unit: "in" }],
    },
  ]);
  expect(upsertPieceSource).toHaveBeenCalledWith({
    designId: "d1",
    castingId: "c1",
    source: "make",
    sourceNote: null,
    fabricType: null,
    fabricColor: null,
    fabricWidth: null,
    fabricSupplier: null,
    fabricYardage: 3.5,
    fabricUnitCost: null,
    made: false,
    makerId: null,
  });
});

test("preserves an existing piece's other fabric fields when filling its yardage", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(
    dataWith([
      piece({
        fabric_type: "Wool",
        fabric_color: "Black",
        fabric_width: '60"',
        fabric_supplier: "Mood",
        fabric_unit_cost: 12,
        made: true,
        maker_id: "m1",
        fabric_yardage: null,
      }),
    ]),
  );
  estimateFabricYardage.mockResolvedValue(new Map([["c1:d1", 4]]));
  upsertPieceSource.mockResolvedValue(piece({ fabric_yardage: 4 }));
  listCostumePieces.mockResolvedValue([piece({ fabric_yardage: 4 })]);

  await POST(req(), ctx("p1"));

  expect(estimateFabricYardage).toHaveBeenCalledWith([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: '60"',
      measurements: [{ label: "Height", value: 70, unit: "in" }],
    },
  ]);
  expect(upsertPieceSource).toHaveBeenCalledWith({
    designId: "d1",
    castingId: "c1",
    source: "make",
    sourceNote: null,
    fabricType: "Wool",
    fabricColor: "Black",
    fabricWidth: '60"',
    fabricSupplier: "Mood",
    fabricYardage: 4,
    fabricUnitCost: 12,
    made: true,
    makerId: "m1",
  });
});

test("returns estimated:0 without calling the AI when nothing is missing", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  const initial = [piece({ fabric_yardage: 2 })];
  loadCostumeCreationsData.mockResolvedValue(dataWith(initial));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: initial, estimated: 0 });
  expect(estimateFabricYardage).not.toHaveBeenCalled();
  expect(upsertPieceSource).not.toHaveBeenCalled();
  expect(listCostumePieces).not.toHaveBeenCalled();
});

test("does not persist keys the model omits", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(dataWith([]));
  estimateFabricYardage.mockResolvedValue(new Map());
  listCostumePieces.mockResolvedValue([]);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: [], estimated: 0 });
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("501 when AI is not configured", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(false);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(501);
  expect(loadCostumeCreationsData).not.toHaveBeenCalled();
  expect(estimateFabricYardage).not.toHaveBeenCalled();
});

test("404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(404);
});
