import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const loadImportContext = vi.fn();
const applyCastImport = vi.fn();
const loadWorkspaceSnapshot = vi.fn();
vi.mock("@/lib/data/cast-import", () => ({
  loadImportContext: (...a: unknown[]) => loadImportContext(...a),
  applyCastImport: (...a: unknown[]) => applyCastImport(...a),
  loadWorkspaceSnapshot: (...a: unknown[]) => loadWorkspaceSnapshot(...a),
}));

import { POST } from "@/app/api/productions/[id]/cast-import/apply/route";
import { ConflictError, NotFoundError } from "@/lib/errors";

const CAST = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const PRODUCTION = "44444444-4444-4444-8444-444444444444";

const existing = {
  casts: [{ id: CAST, name: "Main Cast", color: "slate", isDefault: true }],
  roles: [{ id: ROLE, name: "Annie", isEnsemble: false }],
  performers: [{ id: LEAD, name: "Old Lead" }],
  castings: [{ castId: CAST, roleId: ROLE, performerId: LEAD, assignment: "primary" }],
};

const body = (assignment: string) => ({
  casts: [{ key: "c0", target: { kind: "existing", castId: CAST } }],
  roles: [{ key: "r0", target: { kind: "existing", roleId: ROLE } }],
  performers: [{ key: "p0", target: { kind: "new", name: "Kim Lee" } }],
  castings: [{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment }],
});

const workspace = { casts: [], roles: [], performers: [], castings: [] };

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadImportContext, applyCastImport, loadWorkspaceSnapshot].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: PRODUCTION });
  loadImportContext.mockResolvedValue(existing);
  applyCastImport.mockResolvedValue({ casts: 0, roles: 0, performers: 1, castings: 1 });
  loadWorkspaceSnapshot.mockResolvedValue(workspace);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (json: unknown) =>
  new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });

test("applies a valid import and returns counts plus the fresh workspace", async () => {
  const res = await POST(req(body("understudy")), ctx(PRODUCTION));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ counts: { casts: 0, roles: 0, performers: 1, castings: 1 }, workspace });
  expect(applyCastImport).toHaveBeenCalledWith(PRODUCTION, body("understudy"), existing);
  expect(loadWorkspaceSnapshot).toHaveBeenCalledWith(PRODUCTION);
});

test("404 when the production isn't in the org", async () => {
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  expect((await POST(req(body("understudy")), ctx(PRODUCTION))).status).toBe(404);
  expect(applyCastImport).not.toHaveBeenCalled();
});

test("400 with the first conflict's message when fresh data conflicts", async () => {
  const res = await POST(req(body("primary")), ctx(PRODUCTION));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe(
    "Annie already has a primary in this cast. Make this person an understudy or remove them.",
  );
  expect(applyCastImport).not.toHaveBeenCalled();
});

test("400 when there is nothing new to import", async () => {
  loadImportContext.mockResolvedValue({
    ...existing,
    performers: [...existing.performers],
    castings: [...existing.castings],
  });
  const empty = { casts: [], roles: [], performers: [], castings: [] };
  const res = await POST(req(empty), ctx(PRODUCTION));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Nothing new to import.");
});

test("400 for a malformed body, 409 when the database says the data changed", async () => {
  expect((await POST(req({ casts: "nope" }), ctx(PRODUCTION))).status).toBe(400);
  applyCastImport.mockRejectedValue(new ConflictError("The cast list changed while you were importing. Reload to see the latest."));
  expect((await POST(req(body("understudy")), ctx(PRODUCTION))).status).toBe(409);
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  const res = await POST(req(body("understudy")), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
