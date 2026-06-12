import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { createFabricSupplier } from "@/lib/data/fabric-settings";

// Parse a price field: a finite number ≥ 0, else null.
function parsePrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const supplier = await createFabricSupplier(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      pricePerYard: parsePrice(body.pricePerYard),
      isDefault: body.isDefault === true,
    });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
