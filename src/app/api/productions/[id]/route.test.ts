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

const deleteProduction = vi.fn();
const updateProduction = vi.fn();
const setProductionActive = vi.fn();
const setProductionNotes = vi.fn();
const setCostumesDue = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
  updateProduction: (...a: unknown[]) => updateProduction(...a),
  setProductionActive: (...a: unknown[]) => setProductionActive(...a),
  setProductionNotes: (...a: unknown[]) => setProductionNotes(...a),
  setCostumesDue: (...a: unknown[]) => setCostumesDue(...a),
}));

const listProductionImagePaths = vi.fn();
vi.mock("@/lib/data/storage-paths", () => ({
  listProductionImagePaths: (...a: unknown[]) => listProductionImagePaths(...a),
}));

const removeImages = vi.fn();
vi.mock("@/lib/storage", () => ({
  removeImages: (...a: unknown[]) => removeImages(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/route";

const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteProduction, updateProduction, setProductionActive, setProductionNotes, setCostumesDue, listProductionImagePaths, removeImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  listProductionImagePaths.mockResolvedValue([`${P1}/r1/a.jpg`, `${P1}/designs/d1/b.jpg`]);
  removeImages.mockResolvedValue(undefined);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the production, scoped to the caller's org (200)", async () => {
  deleteProduction.mockResolvedValue(undefined);
  const res = await DELETE(req(), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", P1);
  expect(listProductionImagePaths).toHaveBeenCalledWith(P1);
  expect(removeImages).toHaveBeenCalledWith([`${P1}/r1/a.jpg`, `${P1}/designs/d1/b.jpg`]);
  expect(deleteProduction).toHaveBeenCalledWith("org_1", P1);
});

test("DELETE 404 when the production is not in the caller's org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx(P1));
  expect(res.status).toBe(404);
  expect(deleteProduction).not.toHaveBeenCalled();
});

test("DELETE 500 when the delete fails unexpectedly", async () => {
  deleteProduction.mockRejectedValue(new Error("db exploded"));
  const res = await DELETE(req(), ctx(P1));
  expect(res.status).toBe(500);
});

const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH updates the title (200)", async () => {
  updateProduction.mockResolvedValue({ id: P1, title: "Annie" });
  const res = await PATCH(patchReq({ title: "Annie" }), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: P1, title: "Annie" } });
  expect(updateProduction).toHaveBeenCalledWith("org_1", P1, "Annie");
});

test("PATCH 404 when the production is not in the caller's org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ title: "X" }), ctx(P1));
  expect(res.status).toBe(404);
  expect(updateProduction).not.toHaveBeenCalled();
});

test("PATCH with isActive=false hides the production via setProductionActive (200)", async () => {
  setProductionActive.mockResolvedValue({ id: P1, title: "Annie", is_active: false });
  const res = await PATCH(patchReq({ isActive: false }), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: P1, title: "Annie", is_active: false } });
  expect(setProductionActive).toHaveBeenCalledWith("org_1", P1, false);
  expect(updateProduction).not.toHaveBeenCalled();
});

test("PATCH with isActive=true reactivates the production (200)", async () => {
  setProductionActive.mockResolvedValue({ id: P1, title: "Annie", is_active: true });
  const res = await PATCH(patchReq({ isActive: true }), ctx(P1));
  expect(res.status).toBe(200);
  expect(setProductionActive).toHaveBeenCalledWith("org_1", P1, true);
});

test("PATCH with notes saves via setProductionNotes (200)", async () => {
  setProductionNotes.mockResolvedValue({ id: P1, notes: "strike set Sun" });
  const res = await PATCH(patchReq({ notes: "strike set Sun" }), ctx(P1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: P1, notes: "strike set Sun" } });
  expect(setProductionNotes).toHaveBeenCalledWith("org_1", P1, "strike set Sun");
  expect(updateProduction).not.toHaveBeenCalled();
});

test("PATCH sets the costumes-due date", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  setCostumesDue.mockResolvedValue({ id: P1, costumes_due_date: "2026-11-01" });
  const res = await PATCH(patchReq({ costumesDueDate: "2026-11-01" }), ctx(P1));
  expect(res.status).toBe(200);
  expect(setCostumesDue).toHaveBeenCalledWith("org_1", P1, "2026-11-01");
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(req(), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID production id without touching data", async () => {
  const res = await PATCH(patchReq({ title: "X" }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
