import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const updateMaker = vi.fn();
const deleteMaker = vi.fn();
vi.mock("@/lib/data/makers", () => ({
  updateMaker: (...a: unknown[]) => updateMaker(...a),
  deleteMaker: (...a: unknown[]) => deleteMaker(...a),
}));

import { PATCH, DELETE } from "@/app/api/makers/[makerId]/route";

beforeEach(() => {
  [getAuthContext, updateMaker, deleteMaker].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
});

const ctx = (makerId: string) => ({ params: Promise.resolve({ makerId }) });
function patchReq(body: unknown) {
  return new Request("http://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("PATCH updates a maker", async () => {
  updateMaker.mockResolvedValue({ id: "m1", name: "Nada", color: "blue" });
  const res = await PATCH(patchReq({ name: "Nada", color: "blue" }), ctx("m1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ maker: { id: "m1", name: "Nada", color: "blue" } });
  expect(updateMaker).toHaveBeenCalledWith("org_1", "m1", { name: "Nada", color: "blue" });
});

test("PATCH 404 when the maker is not in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  updateMaker.mockRejectedValue(new NotFoundError("Maker not found"));
  const res = await PATCH(patchReq({ color: "gold" }), ctx("nope"));
  expect(res.status).toBe(404);
});

test("DELETE removes a maker", async () => {
  deleteMaker.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("m1"));
  expect(res.status).toBe(200);
  expect(deleteMaker).toHaveBeenCalledWith("org_1", "m1");
});
