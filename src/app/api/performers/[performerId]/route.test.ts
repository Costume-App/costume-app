import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertPerformerInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertPerformerInOrg: (...a: unknown[]) => assertPerformerInOrg(...a),
}));

const deletePerformer = vi.fn();
const updatePerformer = vi.fn();
const updatePerformerNotes = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  deletePerformer: (...a: unknown[]) => deletePerformer(...a),
  updatePerformer: (...a: unknown[]) => updatePerformer(...a),
  updatePerformerNotes: (...a: unknown[]) => updatePerformerNotes(...a),
}));

import { DELETE, PATCH } from "@/app/api/performers/[performerId]/route";

beforeEach(() => {
  [getAuthContext, assertPerformerInOrg, deletePerformer, updatePerformer, updatePerformerNotes].forEach((m) =>
    m.mockReset()
  );
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertPerformerInOrg.mockResolvedValue(undefined);
});

const ctx = (performerId: string) => ({ params: Promise.resolve({ performerId }) });
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("DELETE removes a performer (200)", async () => {
  deletePerformer.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(assertPerformerInOrg).toHaveBeenCalledWith("org_1", "pf1");
  expect(deletePerformer).toHaveBeenCalledWith("pf1");
});

test("PATCH renames a performer (200)", async () => {
  updatePerformer.mockResolvedValue({ id: "pf1", label: "Jane Banks" });
  const res = await PATCH(patchReq({ label: "Jane Banks" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ performer: { id: "pf1", label: "Jane Banks" } });
  expect(updatePerformer).toHaveBeenCalledWith("pf1", "Jane Banks");
});

test("PATCH 404 when performer not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertPerformerInOrg.mockRejectedValue(new NotFoundError("Performer not found"));
  const res = await PATCH(patchReq({ label: "X" }), ctx("pf1"));
  expect(res.status).toBe(404);
  expect(updatePerformer).not.toHaveBeenCalled();
});

test("PATCH with notes updates notes only", async () => {
  updatePerformerNotes.mockResolvedValue({ id: "pf1", label: "Jane Banks", notes: "hat" });
  const res = await PATCH(patchReq({ notes: "hat" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(updatePerformerNotes).toHaveBeenCalledWith("pf1", "hat");
  expect(updatePerformer).not.toHaveBeenCalled();
});

test("PATCH with notes null clears them", async () => {
  updatePerformerNotes.mockResolvedValue({ id: "pf1", label: "Jane Banks", notes: null });
  const res = await PATCH(patchReq({ notes: null }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(updatePerformerNotes).toHaveBeenCalledWith("pf1", null);
});

test("PATCH with label and notes updates both, label first, and returns the final performer", async () => {
  updatePerformer.mockResolvedValue({ id: "pf1", label: "Jane Banks", notes: "old" });
  updatePerformerNotes.mockResolvedValue({ id: "pf1", label: "Jane Banks", notes: "hat" });
  const res = await PATCH(patchReq({ label: "Jane Banks", notes: "hat" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ performer: { id: "pf1", label: "Jane Banks", notes: "hat" } });
  expect(updatePerformer).toHaveBeenCalledWith("pf1", "Jane Banks");
  expect(updatePerformerNotes).toHaveBeenCalledWith("pf1", "hat");
  const labelOrder = updatePerformer.mock.invocationCallOrder[0];
  const notesOrder = updatePerformerNotes.mock.invocationCallOrder[0];
  expect(labelOrder).toBeLessThan(notesOrder);
});

test("PATCH with a JSON null body is 400, not 500", async () => {
  const res = await PATCH(patchReq(null), ctx("pf1"));
  expect(res.status).toBe(400);
  expect(updatePerformer).not.toHaveBeenCalled();
  expect(updatePerformerNotes).not.toHaveBeenCalled();
});
