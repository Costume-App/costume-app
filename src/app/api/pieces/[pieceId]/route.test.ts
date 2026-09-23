import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-context", () => ({
  getAuthContext: vi.fn(async () => ({ userId: "u1", orgId: "org_1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/data/costume-pieces", () => ({ setPieceMade: vi.fn() }));

import { PATCH } from "@/app/api/pieces/[pieceId]/route";
import { setPieceMade } from "@/lib/data/costume-pieces";

const PC1 = "11111111-1111-4111-8111-111111111111";

const ctx = (pieceId: string) => ({ params: Promise.resolve({ pieceId }) });

beforeEach(() => vi.mocked(setPieceMade).mockReset());

test("PATCH sets made and returns ok", async () => {
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ made: true }) }), ctx(PC1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(setPieceMade).toHaveBeenCalledWith("org_1", PC1, true);
});

test("PATCH rejects a non-boolean made", async () => {
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ made: "yes" }) }), ctx(PC1));
  expect(res.status).toBe(400);
  expect(setPieceMade).not.toHaveBeenCalled();
});

test("PATCH returns 404 for a non-UUID piece id without touching data", async () => {
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ made: true }) }), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(setPieceMade).not.toHaveBeenCalled();
});
