import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/data/inventory-items";
import { listInventoryItemImages } from "@/lib/data/inventory-item-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    const item = await getInventoryItem(orgId, itemId);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    const body = (await request.json()) as {
      name?: string; category?: string | null; size?: string | null; quantity?: number; location?: string | null; notes?: string | null;
    };
    type NullableStr = string | null;
    const patch: { name?: string; category?: NullableStr; size?: NullableStr; quantity?: number; location?: NullableStr; notes?: NullableStr } = {};
    // Nullable fields accept null so the editor can clear them; absent (undefined) leaves them untouched.
    const isStrOrNull = (v: unknown): v is NullableStr => v === null || typeof v === "string";
    if (typeof body.name === "string") patch.name = body.name;
    if (isStrOrNull(body.category)) patch.category = body.category;
    if (isStrOrNull(body.size)) patch.size = body.size;
    if (typeof body.quantity === "number") patch.quantity = body.quantity;
    if (isStrOrNull(body.location)) patch.location = body.location;
    if (isStrOrNull(body.notes)) patch.notes = body.notes;
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
