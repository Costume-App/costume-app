import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { getInventoryItem } from "@/lib/data/inventory-items";
import {
  listInventoryItemImages,
  addInventoryItemImage,
  countInventoryItemImages,
} from "@/lib/data/inventory-item-images";
import { uploadImage, signImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string }> };

const MAX_PER_ITEM = 6;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    const images = await listInventoryItemImages(itemId);
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
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    if ((await countInventoryItemImages(itemId)) >= MAX_PER_ITEM) {
      throw new ValidationError(`Up to ${MAX_PER_ITEM} photos per item`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    if (!file.type.startsWith("image/")) throw new ValidationError("File must be an image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `inventory/${itemId}/${crypto.randomUUID()}.jpg`;
    await uploadImage(path, bytes);
    const image = await addInventoryItemImage(itemId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
