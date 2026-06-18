import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const requireOrgAdmin = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext(), requireOrgAdmin: () => requireOrgAdmin() };
});

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({ ensureOrganization: (...a: unknown[]) => ensureOrganization(...a) }));

const listFabricWidths = vi.fn();
const listFabricSuppliers = vi.fn();
const createFabricWidth = vi.fn();
const createFabricSupplier = vi.fn();
const updateFabricSupplier = vi.fn();
const updateFabricWidth = vi.fn();
const deleteFabricSupplier = vi.fn();
const deleteFabricWidth = vi.fn();
vi.mock("@/lib/data/fabric-settings", () => ({
  listFabricWidths: (...a: unknown[]) => listFabricWidths(...a),
  listFabricSuppliers: (...a: unknown[]) => listFabricSuppliers(...a),
  createFabricWidth: (...a: unknown[]) => createFabricWidth(...a),
  createFabricSupplier: (...a: unknown[]) => createFabricSupplier(...a),
  updateFabricSupplier: (...a: unknown[]) => updateFabricSupplier(...a),
  updateFabricWidth: (...a: unknown[]) => updateFabricWidth(...a),
  deleteFabricSupplier: (...a: unknown[]) => deleteFabricSupplier(...a),
  deleteFabricWidth: (...a: unknown[]) => deleteFabricWidth(...a),
}));

import { GET } from "@/app/api/org/fabric-settings/route";
import { POST } from "@/app/api/org/fabric-settings/widths/route";
import { PATCH as PATCHWidth, DELETE as DELETEWidth } from "@/app/api/org/fabric-settings/widths/[id]/route";
import { POST as POSTSupplier } from "@/app/api/org/fabric-settings/suppliers/route";
import { PATCH as PATCHSupplier, DELETE as DELETESupplier } from "@/app/api/org/fabric-settings/suppliers/[id]/route";

beforeEach(() => {
  [getAuthContext, requireOrgAdmin, ensureOrganization, listFabricWidths, listFabricSuppliers, createFabricWidth, createFabricSupplier, updateFabricSupplier, updateFabricWidth, deleteFabricSupplier, deleteFabricWidth].forEach((m) => m.mockReset());
});

const jsonReq = (body: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patchReq = (body: unknown) =>
  new Request("http://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

test("GET returns both lists for any member", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listFabricWidths.mockResolvedValue([{ id: "w1", value: '54\"' }]);
  listFabricSuppliers.mockResolvedValue([{ id: "s1", name: "Mood", price_per_yard: 4 }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ widths: [{ id: "w1", value: '54\"' }], suppliers: [{ id: "s1", name: "Mood", price_per_yard: 4 }] });
  expect(listFabricWidths).toHaveBeenCalledWith("org_1");
});

test("POST widths creates a width as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricWidth.mockResolvedValue({ id: "w2", value: '60\"', is_default: false });
  const res = await POST(jsonReq({ value: '60\"', isDefault: false }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalled();
  expect(createFabricWidth).toHaveBeenCalledWith("org_1", { value: '60\"', isDefault: false });
});

test("POST widths is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await POST(jsonReq({ value: '60\"' }));
  expect(res.status).toBe(403);
  expect(createFabricWidth).not.toHaveBeenCalled();
});

test("POST suppliers creates a supplier, parsing a numeric-string price", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricSupplier.mockResolvedValue({ id: "s2", name: "JOANN", price_per_yard: 2.99, is_default: true });
  const res = await POSTSupplier(jsonReq({ name: "JOANN", pricePerYard: "2.99", isDefault: true }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalled();
  expect(createFabricSupplier).toHaveBeenCalledWith("org_1", { name: "JOANN", pricePerYard: 2.99, isDefault: true });
});

test("POST suppliers coerces a negative/garbage price to null", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricSupplier.mockResolvedValue({ id: "s3" });
  await POSTSupplier(jsonReq({ name: "X", pricePerYard: -5 }));
  expect(createFabricSupplier).toHaveBeenCalledWith("org_1", { name: "X", pricePerYard: null, isDefault: false });
});

test("POST suppliers is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await POSTSupplier(jsonReq({ name: "Mood" }));
  expect(res.status).toBe(403);
  expect(createFabricSupplier).not.toHaveBeenCalled();
});

test("PATCH suppliers/[id] applies isDefault + parsed price as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  updateFabricSupplier.mockResolvedValue({ id: "s1", name: "Mood", price_per_yard: 4, is_default: true });
  const res = await PATCHSupplier(patchReq({ isDefault: true, pricePerYard: "4" }), idCtx("s1"));
  expect(res.status).toBe(200);
  expect(updateFabricSupplier).toHaveBeenCalledWith("org_1", "s1", { isDefault: true, pricePerYard: 4 });
});

test("PATCH widths/[id] sets the default width as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  updateFabricWidth.mockResolvedValue({ id: "w1", value: '54\"', is_default: true });
  const res = await PATCHWidth(patchReq({ isDefault: true }), idCtx("w1"));
  expect(res.status).toBe(200);
  expect(updateFabricWidth).toHaveBeenCalledWith("org_1", "w1", { isDefault: true });
});

test("PATCH widths/[id] is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await PATCHWidth(patchReq({ isDefault: true }), idCtx("w1"));
  expect(res.status).toBe(403);
  expect(updateFabricWidth).not.toHaveBeenCalled();
});

test("DELETE widths/[id] removes the width as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  deleteFabricWidth.mockResolvedValue(undefined);
  const res = await DELETEWidth(new Request("http://test", { method: "DELETE" }), idCtx("w1"));
  expect(res.status).toBe(200);
  expect(deleteFabricWidth).toHaveBeenCalledWith("org_1", "w1");
});

test("DELETE suppliers/[id] is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await DELETESupplier(new Request("http://test", { method: "DELETE" }), idCtx("s1"));
  expect(res.status).toBe(403);
  expect(deleteFabricSupplier).not.toHaveBeenCalled();
});

test("POST suppliers passes a url through to createFabricSupplier", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricSupplier.mockResolvedValue({ id: "s9" });
  await POSTSupplier(jsonReq({ name: "JOANN", url: "joann.com" }));
  expect(createFabricSupplier).toHaveBeenCalledWith("org_1", { name: "JOANN", pricePerYard: null, isDefault: false, url: "joann.com" });
});

test("PATCH suppliers/[id] passes a url through to updateFabricSupplier", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  updateFabricSupplier.mockResolvedValue({ id: "s1" });
  await PATCHSupplier(patchReq({ url: "moodfabrics.com" }), idCtx("s1"));
  expect(updateFabricSupplier).toHaveBeenCalledWith("org_1", "s1", { url: "moodfabrics.com" });
});
