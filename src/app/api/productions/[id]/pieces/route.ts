import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertCastingInProduction } from "@/lib/data/production-access";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";
import { isCostumeSource } from "@/lib/costume-sources";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const designs = await listCostumeDesigns(id);
    const pieces = await listCostumePieces(designs.map((d) => d.id));
    return NextResponse.json({ pieces });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      designId?: string;
      castingId?: string;
      source?: string;
      sharedWithCastingId?: string | null;
      sourceNote?: string | null;
    };
    if (typeof body.source !== "string" || !isCostumeSource(body.source)) {
      throw new ValidationError("Invalid source");
    }
    if (typeof body.designId !== "string" || typeof body.castingId !== "string") {
      throw new ValidationError("designId and castingId are required");
    }
    const designs = await listCostumeDesigns(id);
    if (!designs.some((d) => d.id === body.designId)) {
      throw new ValidationError("Piece is not part of this production");
    }
    await assertCastingInProduction(id, body.castingId);
    // Shared target must also be a casting in this production (IDOR guard).
    if (body.source === "shared" && body.sharedWithCastingId) {
      await assertCastingInProduction(id, body.sharedWithCastingId);
    }

    const piece = await upsertPieceSource({
      designId: body.designId,
      castingId: body.castingId,
      source: body.source,
      sharedWithCastingId: body.sharedWithCastingId ?? null,
      sourceNote: body.sourceNote ?? null,
    });
    return NextResponse.json({ piece });
  } catch (err) {
    return errorResponse(err);
  }
}
