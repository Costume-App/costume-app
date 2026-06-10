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

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertDesignInProduction, listCostumeDesignImages, countCostumeDesignImages, addCostumeDesignImage, uploadImage, signImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertDesignInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, designId: string) => ({ params: Promise.resolve({ id, designId }) });
function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listCostumeDesignImages.mockResolvedValue([{ id: "i1", storage_path: "p1/designs/d1/a.jpg" }]);
  signImageUrls.mockResolvedValue({ "p1/designs/d1/a.jpg": "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx("p1", "d1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  countCostumeDesignImages.mockResolvedValue(0);
  uploadImage.mockResolvedValue(undefined);
  addCostumeDesignImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadImage).toHaveBeenCalled();
  expect(addCostumeDesignImage).toHaveBeenCalled();
});

test("POST 400 when already at the 6-photo cap", async () => {
  countCostumeDesignImages.mockResolvedValue(6);
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(400);
  expect(uploadImage).not.toHaveBeenCalled();
});

test("POST 404 when the design is not in that production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertDesignInProduction.mockRejectedValue(new NotFoundError("Costume piece not found in this production"));
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(404);
  expect(uploadImage).not.toHaveBeenCalled();
});
