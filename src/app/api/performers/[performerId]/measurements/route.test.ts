import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const getMeasurements = vi.fn();
const upsertMeasurement = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  getMeasurements: (...a: unknown[]) => getMeasurements(...a),
  upsertMeasurement: (...a: unknown[]) => upsertMeasurement(...a),
}));

const assertPerformerInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertPerformerInOrg: (...a: unknown[]) => assertPerformerInOrg(...a),
}));

import { GET, PUT } from "@/app/api/performers/[performerId]/measurements/route";

beforeEach(() => {
  [getAuthContext, getMeasurements, upsertMeasurement, assertPerformerInOrg].forEach((m) => m.mockReset());
  assertPerformerInOrg.mockResolvedValue(undefined);
});

const ctx = (performerId: string) => ({ params: Promise.resolve({ performerId }) });

function putReq(body: unknown) {
  return new Request("http://test", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await GET(new Request("http://test"), ctx("pf1"));
  expect(res.status).toBe(401);
});

test("GET returns measurements", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  getMeasurements.mockResolvedValue([{ measurement_key: "waist", value_numeric: 28 }]);
  const res = await GET(new Request("http://test"), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ measurements: [{ measurement_key: "waist", value_numeric: 28 }] });
  expect(getMeasurements).toHaveBeenCalledWith("pf1");
});

test("PUT upserts one numeric measurement", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockResolvedValue({ measurement_key: "waist", value_numeric: 28, unit: "in" });
  const res = await PUT(putReq({ measurementKey: "waist", valueNumeric: 28, unit: "in" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(upsertMeasurement).toHaveBeenCalledWith({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    valueText: null,
    unit: "in",
  });
});

test("PUT upserts a text measurement", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockResolvedValue({ measurement_key: "shirt_size", value_text: "L", unit: "" });
  const res = await PUT(putReq({ measurementKey: "shirt_size", valueText: "L", unit: "" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(upsertMeasurement).toHaveBeenCalledWith({
    performerId: "pf1",
    measurementKey: "shirt_size",
    valueNumeric: null,
    valueText: "L",
    unit: "",
  });
});

test("PUT 400 on a non-numeric value", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockRejectedValue(new ValidationError("Measurement must be a number"));
  const res = await PUT(putReq({ measurementKey: "waist", valueNumeric: "x", unit: "in" }), ctx("pf1"));
  expect(res.status).toBe(400);
});

test("GET 404 when the performer is not in the caller's org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertPerformerInOrg.mockRejectedValue(new NotFoundError("Performer not found"));
  const res = await GET(new Request("http://test"), ctx("pf1"));
  expect(res.status).toBe(404);
});
