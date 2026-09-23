import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg, assertDesignInProduction } from "@/lib/data/production-access";
import { listCostumeDesignImages, addCostumeDesignImage, countCostumeDesignImages } from "@/lib/data/costume-design-images";
import { uploadImage, signImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; designId: string }> };

const MAX_PER_PIECE = 6;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    const images = await listCostumeDesignImages(designId);
    const urls = await signImageUrls(images.map((i) => i.storage_path));
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
    const { id, designId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    if ((await countCostumeDesignImages(designId)) >= MAX_PER_PIECE) {
      throw new ValidationError(`Up to ${MAX_PER_PIECE} photos per piece`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    if (!file.type.startsWith("image/")) throw new ValidationError("File must be an image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${id}/designs/${designId}/${crypto.randomUUID()}.jpg`;
    await uploadImage(path, bytes);
    const image = await addCostumeDesignImage(designId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
