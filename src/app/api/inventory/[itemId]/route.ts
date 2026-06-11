import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    const body = (await request.json()) as {
      name?: string; category?: string; size?: string; quantity?: number; location?: string; notes?: string;
    };
    const patch: { name?: string; category?: string; size?: string; quantity?: number; location?: string; notes?: string } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.category === "string") patch.category = body.category;
    if (typeof body.size === "string") patch.size = body.size;
    if (typeof body.quantity === "number") patch.quantity = body.quantity;
    if (typeof body.location === "string") patch.location = body.location;
    if (typeof body.notes === "string") patch.notes = body.notes;
    const item = await updateInventoryItem(orgId, itemId, patch);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId); // assert ownership before touching storage
    const images = await listInventoryItemImages(itemId);
    await removeImages(images.map((i) => i.storage_path));
    await deleteInventoryItem(orgId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
