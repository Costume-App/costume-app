import { expect, test, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

import { getAuthContext, AuthError } from "@/lib/auth-context";

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
