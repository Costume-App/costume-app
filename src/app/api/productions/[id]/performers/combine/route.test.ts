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

const loadDuplicateGroups = vi.fn();
const combinePerformers = vi.fn();
vi.mock("@/lib/data/performer-duplicates", () => ({
  loadDuplicateGroups: (...a: unknown[]) => loadDuplicateGroups(...a),
  combinePerformers: (...a: unknown[]) => combinePerformers(...a),
}));

const loadWorkspaceSnapshot = vi.fn();
vi.mock("@/lib/data/cast-import", () => ({
  loadWorkspaceSnapshot: (...a: unknown[]) => loadWorkspaceSnapshot(...a),
}));

import { NotFoundError, ConflictError } from "@/lib/errors";
import { POST } from "@/app/api/productions/[id]/performers/combine/route";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

const member = (performerId: string) => ({ performerId, name: "Ava", filledMeasurements: 0, castings: [] });
const group = (key: string, ids: string[]) => ({ key, keepId: ids[0], members: ids.map(member), blocked: null });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadDuplicateGroups, combinePerformers, loadWorkspaceSnapshot].forEach((m) =>
    m.mockReset(),
  );
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  loadDuplicateGroups.mockResolvedValue([group("ava", [A, B]), group("bo", [C, D])]);
  combinePerformers.mockResolvedValue({ castings_moved: 1, measurements_filled: 2, performers_removed: 1 });
  loadWorkspaceSnapshot.mockResolvedValue({ casts: [], roles: [], performers: [], castings: [] });
});

test("POST combines each matched group in request order and returns counts plus the snapshot", async () => {
  const res = await POST(
    req({ groups: [{ performerIds: [D, C], keepId: C }, { performerIds: [A, B], keepId: A }] }),
    ctx("p1"),
  );
  expect(res.status).toBe(200);
  expect(combinePerformers).toHaveBeenNthCalledWith(1, "p1", C, [D]);
  expect(combinePerformers).toHaveBeenNthCalledWith(2, "p1", A, [B]);
  expect(loadWorkspaceSnapshot).toHaveBeenCalledWith("p1");
  await expect(res.json()).resolves.toEqual({
    counts: { groups: 2, castingsMoved: 2, measurementsFilled: 4, performersRemoved: 2 },
    workspace: { casts: [], roles: [], performers: [], castings: [] },
  });
});

test("POST 404 when the production is not in the org", async () => {
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ groups: [{ performerIds: [A, B], keepId: A }] }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(loadDuplicateGroups).not.toHaveBeenCalled();
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST 400 on a malformed body", async () => {
  const res = await POST(req({ groups: [{ performerIds: [A] }] }), ctx("p1"));
  expect(res.status).toBe(400);
  expect(loadDuplicateGroups).not.toHaveBeenCalled();
});

test("POST 409 when a requested set is not a current group, and runs nothing", async () => {
  const res = await POST(req({ groups: [{ performerIds: [A, C], keepId: A }] }), ctx("p1"));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: "The cast list changed. Reload and review again." });
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST 409 when the requested keeper does not match the computed keeper, and runs nothing", async () => {
  const res = await POST(req({ groups: [{ performerIds: [A, B], keepId: B }] }), ctx("p1"));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: "The cast list changed. Reload and review again." });
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST 409 for a blocked group", async () => {
  loadDuplicateGroups.mockResolvedValue([{ ...group("ava", [A, B]), blocked: { reason: "collision", castId: "ct", roleId: "r" } }]);
  const res = await POST(req({ groups: [{ performerIds: [A, B], keepId: A }] }), ctx("p1"));
  expect(res.status).toBe(409);
  expect(combinePerformers).not.toHaveBeenCalled();
});

test("POST stops at the first failing group and reports how many completed", async () => {
  combinePerformers
    .mockResolvedValueOnce({ castings_moved: 1, measurements_filled: 0, performers_removed: 1 })
    .mockRejectedValueOnce(new ConflictError("Same person is cast twice in one role. Remove one casting first."));
  const res = await POST(
    req({ groups: [{ performerIds: [A, B], keepId: A }, { performerIds: [C, D], keepId: C }] }),
    ctx("p1"),
  );
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({
    error: "Same person is cast twice in one role. Remove one casting first.",
    completed: 1,
  });
  expect(combinePerformers).toHaveBeenCalledTimes(2);
  expect(loadWorkspaceSnapshot).not.toHaveBeenCalled();
});
