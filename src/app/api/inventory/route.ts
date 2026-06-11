import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { listInventoryItems, createInventoryItem } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const items = await listInventoryItems(orgId);
    const thumbs = await firstImagePaths(items.map((i) => i.id));
    const urls = await signImageUrls(Object.values(thumbs));
    return NextResponse.json({
      items: items.map((i) => ({
        ...i,
        thumbUrl: thumbs[i.id] ? urls[thumbs[i.id]] ?? null : null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    const body = (await request.json()) as {
      name?: string; category?: string; size?: string; quantity?: number;
      location?: string; notes?: string; orgName?: string;
    };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const item = await createInventoryItem(orgId, {
      name: body.name,
      category: body.category,
      size: body.size,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      location: body.location,
      notes: body.notes,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
