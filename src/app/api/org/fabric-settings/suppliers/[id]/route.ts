import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { updateFabricSupplier, deleteFabricSupplier } from "@/lib/data/fabric-settings";

type Ctx = { params: Promise<{ id: string }> };

function parsePrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean };
    const patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.pricePerYard !== undefined) patch.pricePerYard = parsePrice(body.pricePerYard);
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    const supplier = await updateFabricSupplier(orgId, id, patch);
    return NextResponse.json({ supplier });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    await deleteFabricSupplier(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
