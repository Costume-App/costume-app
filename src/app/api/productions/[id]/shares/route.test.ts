import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
const requireOrgAdmin = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext(), requireOrgAdmin: () => requireOrgAdmin() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));

const createProductionShare = vi.fn();
const listSharesForProduction = vi.fn();
const revokeShare = vi.fn();
const acceptProductionShare = vi.fn();
vi.mock("@/lib/data/production-shares", () => ({
  createProductionShare: (...a: unknown[]) => createProductionShare(...a),
  listSharesForProduction: (...a: unknown[]) => listSharesForProduction(...a),
  revokeShare: (...a: unknown[]) => revokeShare(...a),
  acceptProductionShare: (...a: unknown[]) => acceptProductionShare(...a),
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { GET, POST } from "@/app/api/productions/[id]/shares/route";
import { DELETE } from "@/app/api/productions/[id]/shares/[shareId]/route";
import { POST as ACCEPT } from "@/app/api/shares/[token]/accept/route";

beforeEach(() => {
  [getAuthContext, requireOrgAdmin, assertProductionInOrg, createProductionShare, listSharesForProduction, revokeShare, acceptProductionShare, sendEmail].forEach((m) => m.mockReset());
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  sendEmail.mockResolvedValue({ sent: true });
});

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const shareCtx = (id: string, shareId: string) => ({ params: Promise.resolve({ id, shareId }) });
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
function postReq(body: unknown) {
  return new Request("http://test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("POST shares creates a share as an admin and returns the token", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  createProductionShare.mockResolvedValue({ id: "s1", token: "tok123" });
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(201);
  expect(createProductionShare).toHaveBeenCalledWith({ sourceProductionId: "p1", sourceOrgId: "orgA", userId: "u1", recipientEmail: null });
  expect(await res.json()).toMatchObject({ token: "tok123" });
});

test("POST shares emails the link best-effort and still 201 when email throws", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  createProductionShare.mockResolvedValue({ id: "s1", token: "tok123" });
  sendEmail.mockRejectedValue(new Error("no domain"));
  const res = await POST(postReq({ recipientEmail: "x@y.com" }), idCtx("p1"));
  expect(res.status).toBe(201);
  expect(createProductionShare).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: "x@y.com" }));
});

test("POST shares is rejected for a non-admin", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  requireOrgAdmin.mockRejectedValue(new AuthError(403, "Admin access required"));
  const res = await POST(postReq({}), idCtx("p1"));
  expect(res.status).toBe(403);
  expect(createProductionShare).not.toHaveBeenCalled();
});

test("GET shares lists shares for an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  listSharesForProduction.mockResolvedValue([{ id: "s1" }]);
  const res = await GET(new Request("http://test"), idCtx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ shares: [{ id: "s1" }] });
});

test("DELETE shares/[shareId] revokes as an admin", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "orgA" });
  revokeShare.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), shareCtx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(revokeShare).toHaveBeenCalledWith("p1", "s1");
});

test("POST accept returns the new production id", async () => {
  getAuthContext.mockResolvedValue({ userId: "u9", orgId: "orgB" });
  acceptProductionShare.mockResolvedValue({ productionId: "p2" });
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(201);
  expect(acceptProductionShare).toHaveBeenCalledWith({ token: "tok123", recipientOrgId: "orgB", userId: "u9" });
  expect(await res.json()).toEqual({ productionId: "p2" });
});

test("POST accept 400 on a used token", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u9", orgId: "orgB" });
  acceptProductionShare.mockRejectedValue(new ValidationError("This share link is no longer valid."));
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(400);
});

test("POST accept 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await ACCEPT(postReq({}), tokenCtx("tok123"));
  expect(res.status).toBe(401);
});
