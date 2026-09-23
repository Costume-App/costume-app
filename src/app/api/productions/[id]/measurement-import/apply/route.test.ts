import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));
const loadMeasurementImportContext = vi.fn();
const applyMeasurementImport = vi.fn();
vi.mock("@/lib/data/measurement-import", () => ({
  loadMeasurementImportContext: (...a: unknown[]) => loadMeasurementImportContext(...a),
  applyMeasurementImport: (...a: unknown[]) => applyMeasurementImport(...a),
}));
const listPerformers = vi.fn();
vi.mock("@/lib/data/performers", () => ({ listPerformers: (...a: unknown[]) => listPerformers(...a) }));

import { POST } from "@/app/api/productions/[id]/measurement-import/apply/route";
import { ConflictError } from "@/lib/errors";

const P1 = "11111111-1111-4111-8111-111111111111";
const PRODUCTION = "22222222-2222-4222-8222-222222222222";
const existing = {
  performers: [{ id: P1, name: "Ada Finch", notes: null, measurements: {} }],
  definitions: [{ key: "chest", label: "Chest / bust", unit: "in", input_type: "number", display_order: 30 }],
};
const body = {
  forms: [{ performer: { kind: "existing", performerId: P1 }, measurements: [{ key: "chest", valueNumeric: 36, valueText: null }], notesAppend: null }],
};

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadMeasurementImportContext, applyMeasurementImport, listPerformers].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: PRODUCTION, title: "T" });
  loadMeasurementImportContext.mockResolvedValue(existing);
  applyMeasurementImport.mockResolvedValue({ performersCreated: 0, measurementsWritten: 1, notesAppended: 0 });
  listPerformers.mockResolvedValue([{ id: P1, production_id: PRODUCTION, label: "Ada Finch", notes: null, created_at: "" }]);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (b: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("applies a valid payload and returns the result and fresh performers", async () => {
  const res = await POST(req(body), ctx(PRODUCTION));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    result: { performersCreated: 0, measurementsWritten: 1, notesAppended: 0 },
    performers: [{ id: P1, name: "Ada Finch" }],
  });
  expect(applyMeasurementImport).toHaveBeenCalledWith(PRODUCTION, body, existing);
});

test("400 for an unknown measurement key", async () => {
  const res = await POST(req({ forms: [{ ...body.forms[0], measurements: [{ key: "elbow", valueNumeric: 1, valueText: null }] }] }), ctx(PRODUCTION));
  expect(res.status).toBe(400);
  expect(applyMeasurementImport).not.toHaveBeenCalled();
});

test("400 when there are no forms", async () => {
  const res = await POST(req({ forms: [] }), ctx(PRODUCTION));
  expect(res.status).toBe(400);
});

test("409 when the review is stale", async () => {
  applyMeasurementImport.mockRejectedValue(new ConflictError("stale"));
  const res = await POST(req(body), ctx(PRODUCTION));
  expect(res.status).toBe(409);
});

test("401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await POST(req(body), ctx(PRODUCTION));
  expect(res.status).toBe(401);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  const res = await POST(req(body), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
