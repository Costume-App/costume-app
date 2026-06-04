import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/auth-context";
import { ValidationError } from "@/lib/errors";
import { listProductions, createProduction } from "@/lib/data/productions";
import { ensureOrganization } from "@/lib/data/organizations";

function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

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
