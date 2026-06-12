import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertCastingInProduction, assertDesignInProduction } from "@/lib/data/production-access";
import { addPieceToInventory } from "@/lib/data/piece-to-inventory";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      designId?: string;
      castingId?: string;
      category?: string | null;
      location?: string | null;
      size?: string | null;
    };
    if (typeof body.designId !== "string" || typeof body.castingId !== "string") {
      throw new ValidationError("designId and castingId are required");
    }
    await assertDesignInProduction(id, body.designId);
    await assertCastingInProduction(id, body.castingId);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const result = await addPieceToInventory(orgId, id, body.designId, body.castingId, {
      category: str(body.category),
      location: str(body.location),
      size: str(body.size),
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
