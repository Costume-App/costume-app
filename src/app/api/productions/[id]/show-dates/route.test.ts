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

const addShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  addShowDate: (...a: unknown[]) => addShowDate(...a),
}));

import { POST } from "@/app/api/productions/[id]/show-dates/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, addShowDate].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST adds a show date (201)", async () => {
  addShowDate.mockResolvedValue({ id: "s1", production_id: "p1", show_date: "2026-08-01" });
  const res = await POST(req({ date: "2026-08-01" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ showDate: { id: "s1", production_id: "p1", show_date: "2026-08-01" } });
  expect(addShowDate).toHaveBeenCalledWith("p1", "2026-08-01");
});

test("POST 400 on an empty date", async () => {
  const { ValidationError } = await import("@/lib/errors");
  addShowDate.mockRejectedValue(new ValidationError("Show date is required"));
  const res = await POST(req({ date: "" }), ctx("p1"));
  expect(res.status).toBe(400);
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(req({ date: "2026-08-01" }), ctx("p1"));
  expect(res.status).toBe(404);
  expect(addShowDate).not.toHaveBeenCalled();
});
