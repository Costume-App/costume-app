import { expect, test, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));
const findOrgsByDomain = vi.fn();
vi.mock("@/lib/data/org-domains", () => ({ findOrgsByDomain: (...a: unknown[]) => findOrgsByDomain(...a) }));
const listOrgAdmins = vi.fn();
vi.mock("@/lib/data/org-members", () => ({ listOrgAdmins: (...a: unknown[]) => listOrgAdmins(...a) }));
const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => isEmailConfigured(),
}));

import { POST } from "@/app/api/org/request-access/route";

beforeEach(() => {
  [authMock, currentUserMock, findOrgsByDomain, listOrgAdmins, sendEmail, isEmailConfigured].forEach((m) => m.mockReset());
  authMock.mockResolvedValue({ userId: "u1" });
  currentUserMock.mockResolvedValue({ firstName: "Pat", lastName: "Lee", emailAddresses: [{ emailAddress: "pat@lincolnhs.edu" }] });
  findOrgsByDomain.mockResolvedValue([{ orgId: "orgA", name: "Lincoln HS" }]);
  listOrgAdmins.mockResolvedValue([{ email: "admin@lincolnhs.edu", name: "Admin" }]);
  isEmailConfigured.mockReturnValue(true);
  sendEmail.mockResolvedValue({ sent: true });
});
const req = (body: unknown) => new Request("https://www.measuremycostume.com/api/org/request-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("401 when not signed in", async () => {
  authMock.mockResolvedValue({ userId: null });
  expect((await POST(req({ orgId: "orgA" }))).status).toBe(401);
});

test("403 when the requester's domain does not map to the posted org", async () => {
  findOrgsByDomain.mockResolvedValue([{ orgId: "orgOTHER", name: "Other" }]);
  const res = await POST(req({ orgId: "orgA" }));
  expect(res.status).toBe(403);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("emails the org admins on a valid match", async () => {
  const res = await POST(req({ orgId: "orgA" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: true });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@lincolnhs.edu" }));
});

test("returns sent:false and sends nothing when email isn't configured", async () => {
  isEmailConfigured.mockReturnValue(false);
  const res = await POST(req({ orgId: "orgA" }));
  expect(await res.json()).toEqual({ sent: false });
  expect(listOrgAdmins).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});
