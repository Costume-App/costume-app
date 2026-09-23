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

const isAiConfigured = vi.fn();
const parseCastList = vi.fn();
vi.mock("@/lib/ai/parse-cast-list", () => {
  class CastListUnreadableError extends Error {}
  class CastListServiceError extends Error {}
  return {
    isAiConfigured: () => isAiConfigured(),
    parseCastList: (...a: unknown[]) => parseCastList(...a),
    CastListUnreadableError,
    CastListServiceError,
  };
});

const toCastListContent = vi.fn();
vi.mock("@/lib/cast-import/input", () => ({ toCastListContent: (...a: unknown[]) => toCastListContent(...a) }));

const loadImportContext = vi.fn();
vi.mock("@/lib/data/cast-import", () => ({ loadImportContext: (...a: unknown[]) => loadImportContext(...a) }));

import { POST } from "@/app/api/productions/[id]/cast-import/parse/route";
import { CastListServiceError, CastListUnreadableError } from "@/lib/ai/parse-cast-list";
import { NotFoundError, ValidationError } from "@/lib/errors";

const MAIN = { id: "11111111-1111-4111-8111-111111111111", name: "Main Cast", color: "slate", isDefault: true };
const existing = { casts: [MAIN], roles: [], performers: [], castings: [] };
const PRODUCTION = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, isAiConfigured, parseCastList, toCastListContent, loadImportContext].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: PRODUCTION, title: "Peter and the Starcatcher" });
  isAiConfigured.mockReturnValue(true);
  toCastListContent.mockResolvedValue([{ type: "text", text: "Alf\tAda Finch" }]);
  loadImportContext.mockResolvedValue(existing);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (form: FormData) => new Request("http://test", { method: "POST", body: form });
const textForm = (text: string) => {
  const f = new FormData();
  f.set("text", text);
  return f;
};

test("returns a draft and the existing snapshot for pasted text", async () => {
  parseCastList.mockResolvedValue({
    casts: [],
    entries: [{ character: "Alf", cast: null, group_label: false, performers: [{ name: "Ada Finch", mark: "unmarked" }] }],
  });
  const res = await POST(req(textForm("Alf\tAda Finch")), ctx(PRODUCTION));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.existing).toEqual(existing);
  expect(body.draft.roles).toEqual([{ key: "r0", sourceName: "Alf", target: { kind: "new", name: "Alf", isEnsemble: false } }]);
  expect(body.draft.castings).toEqual([{ key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" }]);
  expect(toCastListContent).toHaveBeenCalledWith({ text: "Alf\tAda Finch", file: null });
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", PRODUCTION);
  expect(loadImportContext).toHaveBeenCalledWith(PRODUCTION);
});

test("passes an uploaded file through to input conversion", async () => {
  parseCastList.mockResolvedValue({ casts: [], entries: [{ character: "Alf", cast: null, group_label: false, performers: [] }] });
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "cast.pdf"));
  const res = await POST(req(form), ctx(PRODUCTION));
  expect(res.status).toBe(200);
  const arg = toCastListContent.mock.calls[0][0] as { text: string | null; file: File | null };
  expect(arg.text).toBeNull();
  expect(arg.file?.name).toBe("cast.pdf");
});

test("501 when AI isn't configured, before reading input", async () => {
  isAiConfigured.mockReturnValue(false);
  const res = await POST(req(textForm("x")), ctx(PRODUCTION));
  expect(res.status).toBe(501);
  expect((await res.json()).error).toBe("Cast import isn't set up yet.");
  expect(toCastListContent).not.toHaveBeenCalled();
});

test("404 when the production isn't in the org", async () => {
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  expect((await POST(req(textForm("x")), ctx(PRODUCTION))).status).toBe(404);
});

test("400 for input problems, 422 unreadable, 502 service failure", async () => {
  toCastListContent.mockRejectedValueOnce(new ValidationError("Files must be 4 MB or smaller."));
  const tooBig = await POST(req(textForm("x")), ctx(PRODUCTION));
  expect(tooBig.status).toBe(400);
  expect((await tooBig.json()).error).toBe("Files must be 4 MB or smaller.");

  parseCastList.mockRejectedValueOnce(new CastListUnreadableError("No cast list found in that."));
  const unreadable = await POST(req(textForm("x")), ctx(PRODUCTION));
  expect(unreadable.status).toBe(422);
  expect((await unreadable.json()).error).toBe("No cast list found in that.");

  parseCastList.mockRejectedValueOnce(new CastListServiceError("Couldn't read the cast list right now — try again."));
  expect((await POST(req(textForm("x")), ctx(PRODUCTION))).status).toBe(502);
});

test("400 when the body isn't valid form data", async () => {
  const invalidReq = new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await POST(invalidReq, ctx(PRODUCTION));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Paste a cast list or choose a file.");
  expect(consoleSpy).toHaveBeenCalled();
  expect(toCastListContent).not.toHaveBeenCalled();
  consoleSpy.mockRestore();
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  const res = await POST(req(textForm("x")), ctx("not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
  expect(parseCastList).not.toHaveBeenCalled();
});
