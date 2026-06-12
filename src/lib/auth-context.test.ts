import { expect, test, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

import { getAuthContext, requireOrgAdmin, AuthError } from "@/lib/auth-context";

beforeEach(() => authMock.mockReset());

test("returns userId and orgId when signed in with an org", async () => {
  authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
  await expect(getAuthContext()).resolves.toEqual({ userId: "user_1", orgId: "org_1" });
});

test("throws AuthError(401) when not signed in", async () => {
  authMock.mockResolvedValue({ userId: null, orgId: null });
  await expect(getAuthContext()).rejects.toMatchObject({ status: 401 });
});

test("throws AuthError(403) when signed in but no org selected", async () => {
  authMock.mockResolvedValue({ userId: "user_1", orgId: null });
  await expect(getAuthContext()).rejects.toMatchObject({ status: 403 });
});

test("requireOrgAdmin returns context for an org admin", async () => {
  authMock.mockResolvedValue({ userId: "u1", orgId: "org_1", orgRole: "org:admin" });
  await expect(requireOrgAdmin()).resolves.toEqual({ userId: "u1", orgId: "org_1" });
});

test("requireOrgAdmin rejects a non-admin member with 403", async () => {
  authMock.mockResolvedValue({ userId: "u1", orgId: "org_1", orgRole: "org:member" });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 403 });
});

test("requireOrgAdmin rejects when signed out with 401", async () => {
  authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 401 });
});

test("requireOrgAdmin rejects when there is no active org with 403", async () => {
  authMock.mockResolvedValue({ userId: "u1", orgId: null, orgRole: null });
  await expect(requireOrgAdmin()).rejects.toMatchObject({ status: 403 });
});

test("AuthError is exported and carries a status", () => {
  expect(new AuthError(403, "x").status).toBe(403);
});
