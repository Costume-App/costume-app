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
vi.mock("@/lib/data/fabric-settings", () => ({
  listFabricWidths: (...a: unknown[]) => listFabricWidths(...a),
  listFabricSuppliers: (...a: unknown[]) => listFabricSuppliers(...a),
  createFabricWidth: (...a: unknown[]) => createFabricWidth(...a),
}));

import { GET } from "@/app/api/org/fabric-settings/route";
import { POST } from "@/app/api/org/fabric-settings/widths/route";

beforeEach(() => {
  [getAuthContext, requireOrgAdmin, ensureOrganization, listFabricWidths, listFabricSuppliers, createFabricWidth].forEach((m) => m.mockReset());
});

const jsonReq = (body: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

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
