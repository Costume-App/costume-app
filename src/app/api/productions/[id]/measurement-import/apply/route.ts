import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listPerformers } from "@/lib/data/performers";
import { applyMeasurementImport, loadMeasurementImportContext } from "@/lib/data/measurement-import";
import { parseApplyPayload } from "@/lib/measurement-import/payload";

type Ctx = { params: Promise<{ id: string }> };

// Write a reviewed import. Re-reads the production first (the review may be stale), then writes
// everything in one transaction and returns the fresh performer list. parseApplyPayload already
// rejects an empty forms list, so there is no separate check for it here.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const existing = await loadMeasurementImportContext(id);
    const payload = parseApplyPayload(await request.json(), new Set(existing.definitions.map((d) => d.key)));

    const result = await applyMeasurementImport(id, payload, existing);
    const performers = (await listPerformers(id)).map((p) => ({ id: p.id, name: p.label }));
    return NextResponse.json({ result, performers });
  } catch (err) {
    return errorResponse(err);
  }
}
