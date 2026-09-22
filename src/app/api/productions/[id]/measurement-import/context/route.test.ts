import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));
const loadMeasurementImportContext = vi.fn();
vi.mock("@/lib/data/measurement-import", () => ({
  loadMeasurementImportContext: (...a: unknown[]) => loadMeasurementImportContext(...a),
}));

import { GET } from "@/app/api/productions/[id]/measurement-import/context/route";
import { NotFoundError } from "@/lib/errors";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const existing = { performers: [], definitions: [] };

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadMeasurementImportContext].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "T" });
  loadMeasurementImportContext.mockResolvedValue(existing);
});

test("returns the existing data for the production", async () => {
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ existing });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
});

test("404 when the production is not in the org", async () => {
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(404);
  expect(loadMeasurementImportContext).not.toHaveBeenCalled();
});

test("401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await GET(new Request("http://test"), ctx("p1"));
  expect(res.status).toBe(401);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
