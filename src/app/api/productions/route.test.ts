import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const listProductions = vi.fn();
const createProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  listProductions: (...a: unknown[]) => listProductions(...a),
  createProduction: (...a: unknown[]) => createProduction(...a),
}));

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({
  ensureOrganization: (...a: unknown[]) => ensureOrganization(...a),
}));

const addShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  addShowDate: (...a: unknown[]) => addShowDate(...a),
}));

const createCast = vi.fn();
vi.mock("@/lib/data/casts", () => ({
  createCast: (...a: unknown[]) => createCast(...a),
}));

import { GET, POST } from "@/app/api/productions/route";

beforeEach(() => {
  [getAuthContext, listProductions, createProduction, ensureOrganization, addShowDate, createCast].forEach((m) =>
    m.mockReset(),
  );
});

function postReq(body: unknown) {
  return new Request("http://test/api/productions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET returns 401 when not signed in", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await GET();
  expect(res.status).toBe(401);
});

test("GET returns productions for the org", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listProductions.mockResolvedValue([{ id: "p1", title: "Mary Poppins" }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ productions: [{ id: "p1", title: "Mary Poppins" }] });
  expect(listProductions).toHaveBeenCalledWith("org_1");
});

test("POST creates a production, stores the first show date, returns 201", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(postReq({ title: "Newsies", showDate: "2026-11-01", orgName: "Lincoln HS" }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", "Lincoln HS");
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "Newsies",
    notes: null,
  });
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null);
});

test("POST gives the new production a default cast so cast members can be added", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(postReq({ title: "Newsies", showDate: null }));
  expect(res.status).toBe(201);
  expect(createCast).toHaveBeenCalledWith({ productionId: "p2", name: "Main Cast" });
});

test("POST does not add a show date when none is provided", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p3", title: "Cats" });
  const res = await POST(postReq({ title: "Cats", showDate: null }));
  expect(res.status).toBe(201);
  expect(addShowDate).not.toHaveBeenCalled();
});

test("POST maps a ValidationError to 400", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockRejectedValue(new ValidationError("Title is required"));
  const res = await POST(postReq({ showDate: null }));
  expect(res.status).toBe(400);
});

test("POST returns 403 and never touches the DB when there is no active org", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(403, "No active organization"));
  const res = await POST(postReq({ title: "Grease" }));
  expect(res.status).toBe(403);
  expect(ensureOrganization).not.toHaveBeenCalled();
  expect(createProduction).not.toHaveBeenCalled();
});

test("POST returns 400 on a malformed JSON body", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  const req = new Request("http://test/api/productions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});

test("POST coerces a non-string title to empty before calling the data layer", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p9", title: "" });
  await POST(postReq({ title: 42, showDate: null }));
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "",
    notes: null,
  });
});

test("POST creates each provided showing with its time, in order", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(
    postReq({
      title: "Newsies",
      showings: [
        { date: "2026-11-01", time: "19:00" },
        { date: "2026-11-02", time: null },
      ],
    }),
  );
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledTimes(2);
  expect(addShowDate).toHaveBeenNthCalledWith(1, "p2", "2026-11-01", "19:00", null);
  expect(addShowDate).toHaveBeenNthCalledWith(2, "p2", "2026-11-02", null, null);
});

test("POST skips showings whose date is blank", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(
    postReq({ title: "Newsies", showings: [{ date: "", time: "19:00" }, { date: "2026-11-01" }] }),
  );
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledTimes(1);
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null, null);
});

test("POST prefers showings[] over a legacy showDate when both are present", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  await POST(postReq({ title: "Newsies", showDate: "2026-12-31", showings: [{ date: "2026-11-01" }] }));
  expect(addShowDate).toHaveBeenCalledTimes(1);
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null, null);
});

test("POST forwards showing label as the 4th arg to addShowDate", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  await POST(
    postReq({
      title: "Newsies",
      showings: [{ date: "2026-11-01", time: "19:00", label: "Opening Night" }],
    }),
  );
  expect(addShowDate).toHaveBeenCalledTimes(1);
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", "19:00", "Opening Night");
});
