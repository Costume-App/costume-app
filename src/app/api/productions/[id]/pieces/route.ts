import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { assertProductionInOrg, assertCastingInProduction } from "@/lib/data/production-access";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";
import { isCostumeSource } from "@/lib/costume-sources";
import { ValidationError, PlanLimitError } from "@/lib/errors";
import { canAssignMakerToProduction } from "@/lib/data/billing";
import { isSkirtConstruction } from "@/lib/fabric/skirt-yardage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
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
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as {
      designId?: string;
      castingId?: string;
      source?: string;
      sharedWithCastingId?: string | null;
      sourceNote?: string | null;
      fabricType?: string | null;
      fabricColor?: string | null;
      fabricWidth?: string | null;
      fabricSupplier?: string | null;
      fabricYardage?: number | null;
      fabricUnitCost?: number | null;
      skirtConstruction?: string | null;
      skirtFullness?: number | null;
      skirtLengthIn?: number | null;
      calculatedYardage?: number | null;
      purchasePrice?: number | null;
      made?: boolean;
      makerId?: string | null;
    };
    if (typeof body.source !== "string" || !isCostumeSource(body.source)) {
      throw new ValidationError("Invalid source");
    }
    if (typeof body.designId !== "string" || typeof body.castingId !== "string") {
      throw new ValidationError("designId and castingId are required");
    }
    const checkNum = (n: number | null | undefined, field: string) => {
      if (n === undefined || n === null) return;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
        throw new ValidationError(`${field} must be a number ≥ 0`);
      }
    };
    // Fullness and skirt length are geometry inputs, not costs: 0 or negative
    // has no meaning (a 0-fullness gather or 0" length) and would pass the ≥ 0
    // check above and hit no DB constraint before this fix.
    const checkPositive = (n: number | null | undefined, field: string) => {
      if (n === undefined || n === null) return;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
        throw new ValidationError(`${field} must be a number greater than 0`);
      }
    };
    checkNum(body.fabricYardage, "Yardage");
    checkNum(body.fabricUnitCost, "Unit cost");
    checkNum(body.purchasePrice, "Purchase price");
    // Reject an unknown construction rather than letting the DB check constraint
    // surface as a 500.
    if (
      body.skirtConstruction != null &&
      body.skirtConstruction !== "" &&
      !isSkirtConstruction(body.skirtConstruction)
    ) {
      throw new ValidationError("Unknown skirt construction");
    }
    checkPositive(body.skirtFullness, "Fullness");
    checkPositive(body.skirtLengthIn, "Skirt length");
    checkPositive(body.calculatedYardage, "Calculated yardage");
    if (body.made !== undefined && typeof body.made !== "boolean") {
      throw new ValidationError("made must be a boolean");
    }
    if (body.makerId !== undefined && body.makerId !== null && typeof body.makerId !== "string") {
      throw new ValidationError("makerId must be a string or null");
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
    if (body.makerId) {
      const seatGate = await canAssignMakerToProduction(orgId, id, body.makerId);
      if (!seatGate.allowed) throw new PlanLimitError("needs_seat");
    }

    const piece = await upsertPieceSource({
      designId: body.designId,
      castingId: body.castingId,
      source: body.source,
      sharedWithCastingId: body.sharedWithCastingId ?? null,
      sourceNote: body.sourceNote ?? null,
      fabricType: body.fabricType ?? null,
      fabricColor: body.fabricColor ?? null,
      fabricWidth: body.fabricWidth ?? null,
      fabricSupplier: body.fabricSupplier ?? null,
      fabricYardage: body.fabricYardage ?? null,
      fabricUnitCost: body.fabricUnitCost ?? null,
      skirtConstruction: body.skirtConstruction || null,
      skirtFullness: body.skirtFullness ?? null,
      skirtLengthIn: body.skirtLengthIn ?? null,
      calculatedYardage: body.calculatedYardage ?? null,
      purchasePrice: body.purchasePrice ?? null,
      made: body.made ?? false,
      makerId: body.makerId ?? null,
    });
    return NextResponse.json({ piece });
  } catch (err) {
    return errorResponse(err);
  }
}
