import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { parseApplyPayload } from "@/lib/cast-import/payload";
import { analyzeImport } from "@/lib/cast-import/analyze";
import { applyCastImport, loadImportContext, loadWorkspaceSnapshot } from "@/lib/data/cast-import";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// Import a reviewed cast list. Re-checks the payload against fresh data (the review may be stale),
// then creates everything in one transaction and returns fresh workspace state.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const payload = parseApplyPayload(await request.json());

    const existing = await loadImportContext(id);
    const analysis = analyzeImport(payload, existing);
    if (analysis.conflicts.length > 0) throw new ValidationError(analysis.conflicts[0].message);
    const { casts, roles, performers, castings } = analysis.counts;
    if (casts + roles + performers + castings === 0) throw new ValidationError("Nothing new to import.");

    const counts = await applyCastImport(id, payload, existing);
    const workspace = await loadWorkspaceSnapshot(id);
    return NextResponse.json({ counts, workspace });
  } catch (err) {
    return errorResponse(err);
  }
}
