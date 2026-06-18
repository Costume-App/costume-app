import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const acceptProductionShare = vi.fn();
vi.mock("@/lib/data/production-shares", () => ({ acceptProductionShare: (...a: unknown[]) => acceptProductionShare(...a) }));
const canCreateProduction = vi.fn();
const consumeProductionUnlock = vi.fn();
vi.mock("@/lib/data/billing", () => ({
  canCreateProduction: (...a: unknown[]) => canCreateProduction(...a),
  consumeProductionUnlock: (...a: unknown[]) => consumeProductionUnlock(...a),
}));

import { POST } from "@/app/api/shares/[token]/accept/route";

const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = () => new Request("http://test/x", { method: "POST" });

beforeEach(() => {
  [getAuthContext, acceptProductionShare, canCreateProduction, consumeProductionUnlock].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "orgB" });
});

test("blocks accept with 402 when recipient cannot create a production", async () => {
  canCreateProduction.mockResolvedValue({ allowed: false, reason: "needs_unlock", unlimited: false });
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(402);
  expect(acceptProductionShare).not.toHaveBeenCalled();
});

test("accepts and consumes the recipient's unlock", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: false });
  acceptProductionShare.mockResolvedValue({ productionId: "newProd" });
  consumeProductionUnlock.mockResolvedValue(true);
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).toHaveBeenCalledWith("orgB", "newProd");
});

test("unlimited recipient accepts without consuming", async () => {
  canCreateProduction.mockResolvedValue({ allowed: true, unlimited: true });
  acceptProductionShare.mockResolvedValue({ productionId: "newProd" });
  const res = await POST(req(), tokenCtx("tok"));
  expect(res.status).toBe(201);
  expect(consumeProductionUnlock).not.toHaveBeenCalled();
});
