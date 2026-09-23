import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadMeasurementImportContext } from "@/lib/data/measurement-import";

type Ctx = { params: Promise<{ id: string }> };

// The production's performers, their saved measurements and the definitions: what the review
// screen diffs a read form against.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const existing = await loadMeasurementImportContext(id);
    return NextResponse.json({ existing });
  } catch (err) {
    return errorResponse(err);
  }
}
