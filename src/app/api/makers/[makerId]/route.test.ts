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

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, updateMaker, deleteMaker].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
});

const ctx = (makerId: string) => ({ params: Promise.resolve({ makerId }) });
function patchReq(body: unknown) {
  return new Request("http://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("PATCH updates a maker", async () => {
  updateMaker.mockResolvedValue({ id: M1, name: "Nada", color: "blue" });
  const res = await PATCH(patchReq({ name: "Nada", color: "blue" }), ctx(M1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ maker: { id: M1, name: "Nada", color: "blue" } });
  expect(updateMaker).toHaveBeenCalledWith("org_1", M1, { name: "Nada", color: "blue" });
});

test("PATCH 404 when the maker is not in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  updateMaker.mockRejectedValue(new NotFoundError("Maker not found"));
  const res = await PATCH(patchReq({ color: "gold" }), ctx(M2));
  expect(res.status).toBe(404);
});

test("DELETE removes a maker", async () => {
  deleteMaker.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx(M1));
  expect(res.status).toBe(200);
  expect(deleteMaker).toHaveBeenCalledWith("org_1", M1);
});

test("PATCH passes clerkUserId through (link) and null (unlink)", async () => {
  vi.mocked(updateMaker).mockResolvedValue({ id: M1, org_id: "org_1", name: "Jo", color: "slate", clerk_user_id: "user_1", created_at: "" });
  const link = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ clerkUserId: "user_1" }) }), ctx(M1));
  expect(link.status).toBe(200);
  expect(updateMaker).toHaveBeenCalledWith("org_1", M1, { clerkUserId: "user_1" });

  await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ clerkUserId: null }) }), ctx(M1));
  expect(updateMaker).toHaveBeenCalledWith("org_1", M1, { clerkUserId: null });
});

test("DELETE returns 404 for a non-UUID maker id without touching data", async () => {
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(deleteMaker).not.toHaveBeenCalled();
});
