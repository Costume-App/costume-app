import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg, assertDesignInProduction } from "@/lib/data/production-access";
import { updateCostumeDesign, deleteCostumeDesign, setCostumeDesignNotes } from "@/lib/data/costume-designs";
import { listDesignImagePaths } from "@/lib/data/storage-paths";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; designId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string; notes?: string };
    if (typeof body.notes === "string") {
      const design = await setCostumeDesignNotes(id, designId, body.notes);
      return NextResponse.json({ design });
    }
    const design = await updateCostumeDesign(id, designId, typeof body.name === "string" ? body.name : "");
    return NextResponse.json({ design });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId); // assert ownership before touching storage
    await removeImages(await listDesignImagePaths(designId));
    await deleteCostumeDesign(id, designId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
