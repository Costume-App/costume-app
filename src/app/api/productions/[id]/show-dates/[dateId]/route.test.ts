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

const deleteShowDate = vi.fn();
const updateShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  deleteShowDate: (...a: unknown[]) => deleteShowDate(...a),
  updateShowDate: (...a: unknown[]) => updateShowDate(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/show-dates/[dateId]/route";

const P1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteShowDate, updateShowDate].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
});

const ctx = (id: string, dateId: string) => ({ params: Promise.resolve({ id, dateId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes a show date (200)", async () => {
  deleteShowDate.mockResolvedValue(undefined);
  const res = await DELETE(req(), ctx(P1, S1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(deleteShowDate).toHaveBeenCalledWith(P1, S1);
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx(P1, S1));
  expect(res.status).toBe(404);
  expect(deleteShowDate).not.toHaveBeenCalled();
});

const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH updates the date (200)", async () => {
  updateShowDate.mockResolvedValue({ id: S1, show_date: "2026-08-05", show_time: null });
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx(P1, S1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ showDate: { id: S1, show_date: "2026-08-05", show_time: null } });
  expect(updateShowDate).toHaveBeenCalledWith(P1, S1, { show_date: "2026-08-05" });
});

test("PATCH updates the time (200)", async () => {
  updateShowDate.mockResolvedValue({ id: S1, show_date: "2026-08-05", show_time: "14:00:00" });
  const res = await PATCH(patchReq({ time: "14:00" }), ctx(P1, S1));
  expect(res.status).toBe(200);
  expect(updateShowDate).toHaveBeenCalledWith(P1, S1, { show_time: "14:00" });
});

test("PATCH updates the label (200)", async () => {
  updateShowDate.mockResolvedValue({ id: S1, show_date: "2026-08-05", show_time: null, label: "X" });
  const res = await PATCH(patchReq({ label: "X" }), ctx(P1, S1));
  expect(res.status).toBe(200);
  expect(updateShowDate).toHaveBeenCalledWith(P1, S1, { label: "X" });
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx(P1, S1));
  expect(res.status).toBe(404);
  expect(updateShowDate).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(req(), ctx("not-a-uuid", S1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID show date id without touching data", async () => {
  const res = await DELETE(req(), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID production id without touching data", async () => {
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx("not-a-uuid", S1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID show date id without touching data", async () => {
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
