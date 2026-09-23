import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertDesignInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertDesignInProduction: (...a: unknown[]) => assertDesignInProduction(...a),
}));

const updateCostumeDesign = vi.fn();
const deleteCostumeDesign = vi.fn();
const setCostumeDesignNotes = vi.fn();
vi.mock("@/lib/data/costume-designs", () => ({
  updateCostumeDesign: (...a: unknown[]) => updateCostumeDesign(...a),
  deleteCostumeDesign: (...a: unknown[]) => deleteCostumeDesign(...a),
  setCostumeDesignNotes: (...a: unknown[]) => setCostumeDesignNotes(...a),
}));

const listDesignImagePaths = vi.fn();
vi.mock("@/lib/data/storage-paths", () => ({
  listDesignImagePaths: (...a: unknown[]) => listDesignImagePaths(...a),
}));

const removeImages = vi.fn();
vi.mock("@/lib/storage", () => ({
  removeImages: (...a: unknown[]) => removeImages(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/designs/[designId]/route";

const P1 = "11111111-1111-4111-8111-111111111111";
const D1 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertDesignInProduction, updateCostumeDesign, deleteCostumeDesign, setCostumeDesignNotes, listDesignImagePaths, removeImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertDesignInProduction.mockResolvedValue(undefined);
  listDesignImagePaths.mockResolvedValue([`${P1}/designs/${D1}/a.jpg`]);
  removeImages.mockResolvedValue(undefined);
});

const ctx = (id: string, designId: string) => ({ params: Promise.resolve({ id, designId }) });
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("DELETE removes storage objects then the design (200)", async () => {
  deleteCostumeDesign.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, D1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", P1);
  expect(assertDesignInProduction).toHaveBeenCalledWith(P1, D1);
  expect(listDesignImagePaths).toHaveBeenCalledWith(D1);
  expect(removeImages).toHaveBeenCalledWith([`${P1}/designs/${D1}/a.jpg`]);
  expect(deleteCostumeDesign).toHaveBeenCalledWith(P1, D1);
});

test("DELETE removes storage objects before deleting the design row", async () => {
  deleteCostumeDesign.mockResolvedValue(undefined);
  await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, D1));
  expect(removeImages.mock.invocationCallOrder[0]).toBeLessThan(deleteCostumeDesign.mock.invocationCallOrder[0]);
});

test("DELETE 404 when the design is not in that production (cross-production/cross-org), storage untouched", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertDesignInProduction.mockRejectedValue(new NotFoundError("Costume piece not found in this production"));
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, D1));
  expect(res.status).toBe(404);
  expect(listDesignImagePaths).not.toHaveBeenCalled();
  expect(removeImages).not.toHaveBeenCalled();
  expect(deleteCostumeDesign).not.toHaveBeenCalled();
});

test("PATCH with a name renames the design via updateCostumeDesign (200)", async () => {
  updateCostumeDesign.mockResolvedValue({ id: D1, name: "Bert Costume" });
  const res = await PATCH(patchReq({ name: "Bert Costume" }), ctx(P1, D1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ design: { id: D1, name: "Bert Costume" } });
  expect(updateCostumeDesign).toHaveBeenCalledWith(P1, D1, "Bert Costume");
  expect(setCostumeDesignNotes).not.toHaveBeenCalled();
});

test("PATCH saves design notes (200)", async () => {
  setCostumeDesignNotes.mockResolvedValue({ id: D1, notes: "striped shirt" });
  const res = await PATCH(patchReq({ notes: "striped shirt" }), ctx(P1, D1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ design: { id: D1, notes: "striped shirt" } });
  expect(setCostumeDesignNotes).toHaveBeenCalledWith(P1, D1, "striped shirt");
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ notes: "x" }), ctx(P1, D1));
  expect(res.status).toBe(404);
  expect(setCostumeDesignNotes).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("not-a-uuid", D1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID design id without touching data", async () => {
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID production id without touching data", async () => {
  const res = await PATCH(patchReq({ notes: "x" }), ctx("not-a-uuid", D1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID design id without touching data", async () => {
  const res = await PATCH(patchReq({ notes: "x" }), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
