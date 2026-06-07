import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertRoleInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertRoleInProduction: (...a: unknown[]) => assertRoleInProduction(...a),
}));

const listRoleImages = vi.fn();
const countRoleImages = vi.fn();
const addRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  listRoleImages: (...a: unknown[]) => listRoleImages(...a),
  countRoleImages: (...a: unknown[]) => countRoleImages(...a),
  addRoleImage: (...a: unknown[]) => addRoleImage(...a),
}));

const uploadRoleImage = vi.fn();
const signRoleImageUrls = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadRoleImage: (...a: unknown[]) => uploadRoleImage(...a),
  signRoleImageUrls: (...a: unknown[]) => signRoleImageUrls(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/roles/[roleId]/images/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, listRoleImages, countRoleImages, addRoleImage, uploadRoleImage, signRoleImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertRoleInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, roleId: string) => ({ params: Promise.resolve({ id, roleId }) });

function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listRoleImages.mockResolvedValue([{ id: "i1", storage_path: "p1/r1/a.jpg" }]);
  signRoleImageUrls.mockResolvedValue({ "p1/r1/a.jpg": "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  countRoleImages.mockResolvedValue(0);
  uploadRoleImage.mockResolvedValue(undefined);
  addRoleImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadRoleImage).toHaveBeenCalled();
  expect(addRoleImage).toHaveBeenCalled();
});

test("POST 400 when already at the 4-photo cap", async () => {
  countRoleImages.mockResolvedValue(4);
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(400);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(404);
});

test("POST 404 when the role is not in that production (cross-production)", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertRoleInProduction.mockRejectedValue(new NotFoundError("Role not found in this production"));
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(404);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});
