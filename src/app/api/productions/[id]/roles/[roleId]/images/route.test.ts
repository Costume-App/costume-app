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

const P1 = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertRoleInProduction, listRoleImages, countRoleImages, addRoleImage, uploadRoleImage, signRoleImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: P1 });
  assertRoleInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, roleId: string) => ({ params: Promise.resolve({ id, roleId }) });

function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listRoleImages.mockResolvedValue([{ id: "i1", storage_path: `${P1}/${R1}/a.jpg` }]);
  signRoleImageUrls.mockResolvedValue({ [`${P1}/${R1}/a.jpg`]: "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx(P1, R1));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  countRoleImages.mockResolvedValue(0);
  uploadRoleImage.mockResolvedValue(undefined);
  addRoleImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx(P1, R1));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadRoleImage).toHaveBeenCalled();
  expect(addRoleImage).toHaveBeenCalled();
});

test("POST 400 when already at the 6-photo cap", async () => {
  countRoleImages.mockResolvedValue(6);
  const res = await POST(postReq(), ctx(P1, R1));
  expect(res.status).toBe(400);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});

test("POST allows a 5th photo (under the 6 cap)", async () => {
  countRoleImages.mockResolvedValue(5);
  uploadRoleImage.mockResolvedValue(undefined);
  addRoleImage.mockResolvedValue({ id: "i6" });
  const res = await POST(postReq(), ctx(P1, R1));
  expect(res.status).toBe(201);
  expect(uploadRoleImage).toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq(), ctx(P1, R1));
  expect(res.status).toBe(404);
});

test("POST 404 when the role is not in that production (cross-production)", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertRoleInProduction.mockRejectedValue(new NotFoundError("Role not found in this production"));
  const res = await POST(postReq(), ctx(P1, R1));
  expect(res.status).toBe(404);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID production id without touching data", async () => {
  const res = await GET(new Request("http://test"), ctx("not-a-uuid", R1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("GET returns 404 for a non-UUID role id without touching data", async () => {
  const res = await GET(new Request("http://test"), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID production id without touching data", async () => {
  const res = await POST(postReq(), ctx("not-a-uuid", R1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("POST returns 404 for a non-UUID role id without touching data", async () => {
  const res = await POST(postReq(), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
