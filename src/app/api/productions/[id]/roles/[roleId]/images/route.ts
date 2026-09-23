import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg, assertRoleInProduction } from "@/lib/data/production-access";
import { listRoleImages, addRoleImage, countRoleImages } from "@/lib/data/role-images";
import { uploadRoleImage, signRoleImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

const MAX_PER_ROLE = 6;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertRoleInProduction(id, roleId);
    const images = await listRoleImages(roleId);
    const urls = await signRoleImageUrls(images.map((i) => i.storage_path));
    return NextResponse.json({
      images: images.map((i) => ({ id: i.id, url: urls[i.storage_path] ?? null })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertRoleInProduction(id, roleId);
    if ((await countRoleImages(roleId)) >= MAX_PER_ROLE) {
      throw new ValidationError(`Up to ${MAX_PER_ROLE} photos per role`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    if (!file.type.startsWith("image/")) throw new ValidationError("File must be an image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${id}/${roleId}/${crypto.randomUUID()}.jpg`;
    await uploadRoleImage(path, bytes);
    const image = await addRoleImage(roleId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
