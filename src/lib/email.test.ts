import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const send = vi.fn();
vi.mock("resend", () => ({
  // Vitest requires a `function` (not arrow) impl for a mock used with `new`.
  Resend: vi.fn(function () {
    return { emails: { send } };
  }),
}));

import { isEmailConfigured, sendEmail } from "@/lib/email";
import { Resend } from "resend";

beforeEach(() => {
  send.mockReset();
  (Resend as unknown as ReturnType<typeof vi.fn>).mockClear();
  vi.unstubAllEnvs();
});

test("isEmailConfigured reflects RESEND_API_KEY", () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(isEmailConfigured()).toBe(false);
  vi.stubEnv("RESEND_API_KEY", "re_123");
  expect(isEmailConfigured()).toBe(true);
});

test("sendEmail no-ops and never constructs Resend without a key", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const out = await sendEmail({ to: "s@x.com", subject: "Hi", text: "Body" });
  expect(out).toEqual({ sent: false });
  expect(Resend).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("sendEmail sends via Resend with the default from when configured", async () => {
  vi.stubEnv("RESEND_API_KEY", "re_123");
  vi.stubEnv("FEEDBACK_FROM_EMAIL", "");
  send.mockResolvedValue({ data: { id: "e1" }, error: null });
  const out = await sendEmail({ to: "support@measuremycostume.com", subject: "Subj", text: "Body" });
  expect(out).toEqual({ sent: true });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "support@measuremycostume.com",
      subject: "Subj",
      text: "Body",
      from: "Measure My Costume <feedback@measuremycostume.com>",
    }),
  );
});

test("sendEmail throws when Resend returns an error", async () => {
  vi.stubEnv("RESEND_API_KEY", "re_123");
  send.mockResolvedValue({ data: null, error: { message: "bad domain" } });
  await expect(sendEmail({ to: "s@x.com", subject: "S", text: "B" })).rejects.toThrow("bad domain");
});
