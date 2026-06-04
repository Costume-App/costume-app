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

import { GET, POST } from "@/app/api/productions/route";

beforeEach(() => {
  [getAuthContext, listProductions, createProduction, ensureOrganization].forEach((m) => m.mockReset());
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

test("POST creates a production and returns 201", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(postReq({ title: "Newsies", showDate: "2026-11-01", orgName: "Lincoln HS" }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", "Lincoln HS");
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "Newsies",
    showDate: "2026-11-01",
    notes: null,
  });
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
    showDate: null,
    notes: null,
  });
});
