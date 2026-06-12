import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));

const getOrganizationMembershipList = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ organizations: { getOrganizationMembershipList } })),
}));

import { GET } from "@/app/api/org/members/route";

beforeEach(() => {
  getOrganizationMembershipList.mockReset();
});

test("GET returns mapped org members", async () => {
  getOrganizationMembershipList.mockResolvedValue({
    data: [
      { publicUserData: { userId: "u1", firstName: "Ada", lastName: "Lovelace", identifier: "ada@x.com", imageUrl: "http://img/1" } },
      { publicUserData: { userId: "u2", firstName: null, lastName: null, identifier: "bob@x.com", imageUrl: "http://img/2" } },
    ],
  });
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(getOrganizationMembershipList).toHaveBeenCalledWith({ organizationId: "org_1" });
  expect(body.members).toEqual([
    { userId: "u1", name: "Ada Lovelace", email: "ada@x.com", imageUrl: "http://img/1" },
    { userId: "u2", name: "bob@x.com", email: "bob@x.com", imageUrl: "http://img/2" },
  ]);
});
