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
vi.mock("@/lib/data/performers", () => ({
  deletePerformer: (...a: unknown[]) => deletePerformer(...a),
  updatePerformer: (...a: unknown[]) => updatePerformer(...a),
}));

import { DELETE, PATCH } from "@/app/api/performers/[performerId]/route";

beforeEach(() => {
  [getAuthContext, assertPerformerInOrg, deletePerformer, updatePerformer].forEach((m) => m.mockReset());
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
