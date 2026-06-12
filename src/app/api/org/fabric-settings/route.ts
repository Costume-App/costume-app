import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { listFabricWidths, listFabricSuppliers } from "@/lib/data/fabric-settings";

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const [widths, suppliers] = await Promise.all([listFabricWidths(orgId), listFabricSuppliers(orgId)]);
    return NextResponse.json({ widths, suppliers });
  } catch (err) {
    return errorResponse(err);
  }
}
