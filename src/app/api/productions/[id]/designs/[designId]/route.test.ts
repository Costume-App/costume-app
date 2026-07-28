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

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, updateCostumeDesign, deleteCostumeDesign, setCostumeDesignNotes, listDesignImagePaths, removeImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  listDesignImagePaths.mockResolvedValue(["p1/designs/d1/a.jpg"]);
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
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "d1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
  expect(listDesignImagePaths).toHaveBeenCalledWith("d1");
  expect(removeImages).toHaveBeenCalledWith(["p1/designs/d1/a.jpg"]);
  expect(deleteCostumeDesign).toHaveBeenCalledWith("p1", "d1");
});

test("PATCH with a name renames the design via updateCostumeDesign (200)", async () => {
  updateCostumeDesign.mockResolvedValue({ id: "d1", name: "Bert Costume" });
  const res = await PATCH(patchReq({ name: "Bert Costume" }), ctx("p1", "d1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ design: { id: "d1", name: "Bert Costume" } });
  expect(updateCostumeDesign).toHaveBeenCalledWith("p1", "d1", "Bert Costume");
  expect(setCostumeDesignNotes).not.toHaveBeenCalled();
});

test("PATCH saves design notes (200)", async () => {
  setCostumeDesignNotes.mockResolvedValue({ id: "d1", notes: "striped shirt" });
  const res = await PATCH(patchReq({ notes: "striped shirt" }), ctx("p1", "d1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ design: { id: "d1", notes: "striped shirt" } });
  expect(setCostumeDesignNotes).toHaveBeenCalledWith("p1", "d1", "striped shirt");
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ notes: "x" }), ctx("p1", "d1"));
  expect(res.status).toBe(404);
  expect(setCostumeDesignNotes).not.toHaveBeenCalled();
});
