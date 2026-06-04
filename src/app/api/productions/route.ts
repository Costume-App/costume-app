import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listProductions, createProduction } from "@/lib/data/productions";
import { ensureOrganization } from "@/lib/data/organizations";

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
      showDate: body.showDate ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ production }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
