import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const createFeedback = vi.fn();
vi.mock("@/lib/data/feedback", () => ({ createFeedback: (...a: unknown[]) => createFeedback(...a) }));

const getUserEmail = vi.fn();
vi.mock("@/lib/clerk-user", () => ({ getUserEmail: (...a: unknown[]) => getUserEmail(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { POST } from "@/app/api/feedback/route";

beforeEach(() => {
  [getAuthContext, createFeedback, getUserEmail, sendEmail].forEach((m) => m.mockReset());
  getUserEmail.mockResolvedValue("a@b.com");
  sendEmail.mockResolvedValue({ sent: true });
});

function postReq(body: unknown) {
  return new Request("http://test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sample = { id: "f1", org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken", created_at: "t" };

test("POST 201 saves feedback and emails support", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockResolvedValue(sample);
  const res = await POST(postReq({ type: "fix", message: "Broken" }));
  expect(res.status).toBe(201);
  expect(createFeedback).toHaveBeenCalledWith({ orgId: "org_1", userId: "u1", userEmail: "a@b.com", type: "fix", message: "Broken" });
  expect(sendEmail).toHaveBeenCalled();
});

test("POST still 201 when the email send throws (best-effort)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockResolvedValue(sample);
  sendEmail.mockRejectedValue(new Error("unverified domain"));
  const res = await POST(postReq({ type: "fix", message: "Broken" }));
  expect(res.status).toBe(201);
});

test("POST 400 when createFeedback rejects", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockRejectedValue(new ValidationError("Feedback message is required"));
  const res = await POST(postReq({ type: "fix", message: "" }));
  expect(res.status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("POST 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await POST(postReq({ type: "fix", message: "Hi" }));
  expect(res.status).toBe(401);
});
