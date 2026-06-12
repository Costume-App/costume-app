import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getInventoryItem, listInventoryUsage, listInventoryMadeFor } from "@/lib/data/inventory-items";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    await getInventoryItem(orgId, itemId);
    const [usage, madeFor] = await Promise.all([
      listInventoryUsage(itemId),
      listInventoryMadeFor(itemId),
    ]);
    return NextResponse.json({ usage, madeFor });
  } catch (err) {
    return errorResponse(err);
  }
}
