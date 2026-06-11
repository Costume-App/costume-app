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

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteShowDate, updateShowDate].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, dateId: string) => ({ params: Promise.resolve({ id, dateId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes a show date (200)", async () => {
  deleteShowDate.mockResolvedValue(undefined);
  const res = await DELETE(req(), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(deleteShowDate).toHaveBeenCalledWith("p1", "s1");
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx("p1", "s1"));
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
  updateShowDate.mockResolvedValue({ id: "s1", show_date: "2026-08-05", show_time: null });
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ showDate: { id: "s1", show_date: "2026-08-05", show_time: null } });
  expect(updateShowDate).toHaveBeenCalledWith("p1", "s1", { show_date: "2026-08-05" });
});

test("PATCH updates the time (200)", async () => {
  updateShowDate.mockResolvedValue({ id: "s1", show_date: "2026-08-05", show_time: "14:00:00" });
  const res = await PATCH(patchReq({ time: "14:00" }), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(updateShowDate).toHaveBeenCalledWith("p1", "s1", { show_time: "14:00" });
});

test("PATCH updates the label (200)", async () => {
  updateShowDate.mockResolvedValue({ id: "s1", show_date: "2026-08-05", show_time: null, label: "X" });
  const res = await PATCH(patchReq({ label: "X" }), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(updateShowDate).toHaveBeenCalledWith("p1", "s1", { label: "X" });
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx("p1", "s1"));
  expect(res.status).toBe(404);
  expect(updateShowDate).not.toHaveBeenCalled();
});
