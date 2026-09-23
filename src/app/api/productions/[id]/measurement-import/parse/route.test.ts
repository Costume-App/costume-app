import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});
const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({ assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a) }));

const isAiConfigured = vi.fn();
const readMeasurementForm = vi.fn();
vi.mock("@/lib/ai/read-measurement-form", () => {
  class MeasurementFormUnreadableError extends Error {}
  class MeasurementFormServiceError extends Error {}
  return {
    isAiConfigured: () => isAiConfigured(),
    readMeasurementForm: (...a: unknown[]) => readMeasurementForm(...a),
    MeasurementFormUnreadableError,
    MeasurementFormServiceError,
  };
});
const toFormContent = vi.fn();
vi.mock("@/lib/measurement-import/input", () => ({ toFormContent: (...a: unknown[]) => toFormContent(...a), CHOOSE_FILE: "Choose a photo of a measurement form." }));
const loadMeasurementImportContext = vi.fn();
vi.mock("@/lib/data/measurement-import", () => ({
  loadMeasurementImportContext: (...a: unknown[]) => loadMeasurementImportContext(...a),
}));

import { POST } from "@/app/api/productions/[id]/measurement-import/parse/route";
import { MeasurementFormServiceError, MeasurementFormUnreadableError } from "@/lib/ai/read-measurement-form";
import { ValidationError } from "@/lib/errors";

const P1 = "11111111-1111-4111-8111-111111111111";
const existing = {
  performers: [{ id: P1, name: "Ada Finch", notes: null, measurements: {} }],
  definitions: [{ key: "chest", label: "Chest / bust", unit: "in", input_type: "number", display_order: 30 }],
};
const extraction = {
  name: "Ada Finch",
  casted_as: "Alf",
  sex: null,
  age: null,
  contact: null,
  sizes: { shirt: null, pant: null, shoe: null },
  fields: [{ label: "A chest", value: "36" }],
  notes: [],
};

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, isAiConfigured, readMeasurementForm, toFormContent, loadMeasurementImportContext].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "T" });
  isAiConfigured.mockReturnValue(true);
  toFormContent.mockResolvedValue({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AQID" } });
  loadMeasurementImportContext.mockResolvedValue(existing);
  readMeasurementForm.mockResolvedValue(extraction);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://test", { method: "POST", body: form });
}
const jpg = new File([new Uint8Array([1, 2, 3])], "form.jpg", { type: "image/jpeg" });

test("returns a draft matched against the production", async () => {
  const res = await POST(req(jpg), ctx("p1"));
  expect(res.status).toBe(200);
  const { draft } = await res.json();
  expect(draft.fileName).toBe("form.jpg");
  expect(typeof draft.id).toBe("string");
  expect(draft.name).toBe("Ada Finch");
  expect(draft.castedAs).toBe("Alf");
  expect(draft.performer).toEqual({ kind: "existing", performerId: P1 });
  expect(draft.fields).toEqual([{ key: "chest", label: "A chest", raw: "36", valueNumeric: 36, valueText: null }]);
  expect(assertProductionInOrg).toHaveBeenCalledWith("org_1", "p1");
});

test("stamps the notes block with the date the browser sent", async () => {
  readMeasurementForm.mockResolvedValue({ ...extraction, notes: ["Vest"] });
  const form = new FormData();
  form.set("file", jpg);
  form.set("today", "2026-09-22");
  const res = await POST(new Request("http://test", { method: "POST", body: form }), ctx("p1"));
  const { draft } = await res.json();
  expect(draft.notesToAppend).toBe("From measurement form, 2026-09-22:\nVest");
});

test("501 when AI is not configured", async () => {
  isAiConfigured.mockReturnValue(false);
  const res = await POST(req(jpg), ctx("p1"));
  expect(res.status).toBe(501);
  expect(readMeasurementForm).not.toHaveBeenCalled();
});

test("400 for a non-multipart body", async () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await POST(new Request("http://test", { method: "POST", body: "nope" }), ctx("p1"));
  expect(res.status).toBe(400);
  consoleSpy.mockRestore();
});

test("400 when the multipart body has no file", async () => {
  toFormContent.mockRejectedValueOnce(new ValidationError("Choose a photo of a measurement form."));
  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(400);
  expect(readMeasurementForm).not.toHaveBeenCalled();
});

test("422 for an unreadable photo and 502 for a service failure", async () => {
  readMeasurementForm.mockRejectedValue(new MeasurementFormUnreadableError("no form"));
  expect((await POST(req(jpg), ctx("p1"))).status).toBe(422);
  readMeasurementForm.mockRejectedValue(new MeasurementFormServiceError("down"));
  expect((await POST(req(jpg), ctx("p1"))).status).toBe(502);
});

test("401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await POST(req(jpg), ctx("p1"));
  expect(res.status).toBe(401);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
