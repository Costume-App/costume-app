import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listOrgMembers } from "@/lib/data/org-members";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const members = await listOrgMembers(orgId);
    return NextResponse.json({ members });
  } catch (err) {
    return errorResponse(err);
  }
}
