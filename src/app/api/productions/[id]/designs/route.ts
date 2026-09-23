import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listCostumeDesigns, createCostumeDesign } from "@/lib/data/costume-designs";
import { listRoles } from "@/lib/data/roles";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { getInventoryItem } from "@/lib/data/inventory-items";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const designs = await listCostumeDesigns(id);
    return NextResponse.json({ designs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { roleId?: string; name?: string; inventoryItemId?: string };
    if (typeof body.roleId !== "string" || !body.roleId) throw new ValidationError("roleId is required");
    const roles = await listRoles(id);
    if (!roles.some((r) => r.id === body.roleId)) {
      throw new NotFoundError("Role not found in this production");
    }
    let name = typeof body.name === "string" ? body.name : "";
    let inventoryItemId: string | undefined;
    let inventoryLocation: string | null = null;
    if (typeof body.inventoryItemId === "string" && body.inventoryItemId) {
      const item = await getInventoryItem(orgId, body.inventoryItemId);
      inventoryItemId = item.id;
      inventoryLocation = item.location;
      if (!name.trim()) name = item.name; // default the piece name from the item
    }
    const design = await createCostumeDesign({ productionId: id, roleId: body.roleId, name, inventoryItemId });
    // Enrich the response for inventory-linked adds so the panel shows the location
    // immediately, matching listCostumeDesigns (which the panel uses on reload/refetch).
    return NextResponse.json(
      { design: inventoryItemId ? { ...design, inventory_location: inventoryLocation } : design },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
