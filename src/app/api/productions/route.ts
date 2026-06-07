import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listProductions, createProduction } from "@/lib/data/productions";
import { ensureOrganization } from "@/lib/data/organizations";
import { addShowDate } from "@/lib/data/show-dates";
import { createCast } from "@/lib/data/casts";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const productions = await listProductions(orgId);
    return NextResponse.json({ productions });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as {
      title?: string;
      showDate?: string | null;
      notes?: string | null;
      orgName?: string;
    };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const production = await createProduction({
      orgId,
      createdBy: userId,
      title: typeof body.title === "string" ? body.title : "",
      notes: body.notes ?? null,
    });
    // Every production starts with a default cast so cast members can be added
    // right away. The 0004 migration only backfilled productions that already
    // existed; without this, new productions had no cast and cast-member adds
    // silently no-opped (no selected cast).
    await createCast({ productionId: production.id, name: "Main Cast" });
    if (typeof body.showDate === "string" && body.showDate.trim()) {
      await addShowDate(production.id, body.showDate, null);
    }
    return NextResponse.json({ production }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
