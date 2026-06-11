import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteProduction, updateProduction, setProductionActive, setProductionNotes, setCostumesDue } from "@/lib/data/productions";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteProduction(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { title?: string; isActive?: boolean; notes?: string; costumesDueDate?: string | null };
    if (typeof body.isActive === "boolean") {
      const production = await setProductionActive(orgId, id, body.isActive);
      return NextResponse.json({ production });
    }
    if (typeof body.notes === "string") {
      const production = await setProductionNotes(orgId, id, body.notes);
      return NextResponse.json({ production });
    }
    if (body.costumesDueDate !== undefined) {
      const production = await setCostumesDue(orgId, id, body.costumesDueDate);
      return NextResponse.json({ production });
    }
    const production = await updateProduction(orgId, id, typeof body.title === "string" ? body.title : "");
    return NextResponse.json({ production });
  } catch (err) {
    return errorResponse(err);
  }
}
