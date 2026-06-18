import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { updateFabricSupplier, deleteFabricSupplier } from "@/lib/data/fabric-settings";

type Ctx = { params: Promise<{ id: string }> };

// Accepts a numeric string (e.g. "4.99") so a typed price isn't silently dropped.
function parsePrice(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await requireOrgAdmin();
    const { id } = await params;
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean; url?: string };
    const patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean; url?: string } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.pricePerYard !== undefined) patch.pricePerYard = parsePrice(body.pricePerYard);
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    if (typeof body.url === "string") patch.url = body.url;
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
