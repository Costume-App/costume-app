import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { listMakers, createMaker } from "@/lib/data/makers";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const makers = await listMakers(orgId);
    return NextResponse.json({ makers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    const body = (await request.json()) as { name?: string; color?: string; orgName?: string; clerkUserId?: string | null };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const maker = await createMaker(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      color: typeof body.color === "string" ? body.color : undefined,
      clerkUserId: body.clerkUserId === null || typeof body.clerkUserId === "string" ? body.clerkUserId : undefined,
    });
    return NextResponse.json({ maker }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
