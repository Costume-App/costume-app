import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertDesignInProduction } from "@/lib/data/production-access";
import { deleteCostumeDesignImage } from "@/lib/data/costume-design-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; designId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId, imageId } = await params;
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    const path = await deleteCostumeDesignImage(designId, imageId);
    if (path) await removeImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
