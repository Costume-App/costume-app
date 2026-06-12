import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ensureOrganization } from "@/lib/data/organizations";
import { createFabricWidth } from "@/lib/data/fabric-settings";

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const body = (await request.json()) as { value?: string; isDefault?: boolean; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const width = await createFabricWidth(orgId, {
      value: typeof body.value === "string" ? body.value : "",
      isDefault: body.isDefault === true,
    });
    return NextResponse.json({ width }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
