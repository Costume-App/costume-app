import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { getInventoryItem } from "@/lib/data/inventory-items";
import { deleteInventoryItemImage } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId, imageId } = await idParams(params);
    await getInventoryItem(orgId, itemId);
    const path = await deleteInventoryItemImage(itemId, imageId);
    if (path) await removeImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
