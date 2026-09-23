import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertDesignInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertDesignInProduction: (...a: unknown[]) => assertDesignInProduction(...a),
}));

const listCostumeDesignImages = vi.fn();
const countCostumeDesignImages = vi.fn();
const addCostumeDesignImage = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({
  listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a),
  countCostumeDesignImages: (...a: unknown[]) => countCostumeDesignImages(...a),
  addCostumeDesignImage: (...a: unknown[]) => addCostumeDesignImage(...a),
}));

const uploadImage = vi.fn();
const signImageUrls = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadImage: (...a: unknown[]) => uploadImage(...a),
  signImageUrls: (...a: unknown[]) => signImageUrls(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/designs/[designId]/images/route";

const P1 = "11111111-1111-4111-8111-111111111111";
const D1 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertDesignInProduction, listCostumeDesignImages, countCostumeDesignImages, addCostumeDesignImage, uploadImage, signImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertDesignInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, designId: string) => ({ params: Promise.resolve({ id, designId }) });
function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listCostumeDesignImages.mockResolvedValue([{ id: "i1", storage_path: `${P1}/designs/${D1}/a.jpg` }]);
  signImageUrls.mockResolvedValue({ [`${P1}/designs/${D1}/a.jpg`]: "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx(P1, D1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  countCostumeDesignImages.mockResolvedValue(0);
  uploadImage.mockResolvedValue(undefined);
  addCostumeDesignImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx(P1, D1));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadImage).toHaveBeenCalled();
  expect(addCostumeDesignImage).toHaveBeenCalled();
});

test("POST 400 when already at the 6-photo cap", async () => {
  countCostumeDesignImages.mockResolvedValue(6);
  const res = await POST(postReq(), ctx(P1, D1));
  expect(res.status).toBe(400);
  expect(uploadImage).not.toHaveBeenCalled();
});

test("POST 404 when the design is not in that production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertDesignInProduction.mockRejectedValue(new NotFoundError("Costume piece not found in this production"));
  const res = await POST(postReq(), ctx(P1, D1));
  expect(res.status).toBe(404);
  expect(uploadImage).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID production id without touching data", async () => {
  const res = await GET(new Request("http://test"), ctx("not-a-uuid", D1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID design id without touching data", async () => {
  const res = await GET(new Request("http://test"), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  const res = await POST(postReq(), ctx("not-a-uuid", D1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID design id without touching data", async () => {
  const res = await POST(postReq(), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
