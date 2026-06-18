import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { createFeedback } from "@/lib/data/feedback";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("createFeedback inserts a trimmed message with provenance", async () => {
  setResult({ id: "f1", org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken", created_at: "t" });
  await createFeedback({ orgId: "org_1", userId: "u1", userEmail: "a@b.com", type: "fix", message: "  Broken  " });
  expect(from).toHaveBeenCalledWith("feedback");
  expect(chain.insert).toHaveBeenCalledWith({
    org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken",
  });
});

test("createFeedback rejects an empty message", async () => {
  await expect(
    createFeedback({ orgId: "org_1", userId: "u1", userEmail: null, type: "fix", message: "   " }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("createFeedback rejects an invalid type", async () => {
  await expect(
    createFeedback({ orgId: "org_1", userId: "u1", userEmail: null, type: "nope", message: "hi" }),
  ).rejects.toBeInstanceOf(ValidationError);
});
