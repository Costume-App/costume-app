import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { buildMakeWorklist } from "@/lib/tailor-summary";
import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";
import { pieceKey } from "@/lib/costume-merge";
import { isAiConfigured, estimateFabricYardage, type EstimateItem } from "@/lib/ai/estimate-fabric";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    const production = await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "AI estimates are not configured." }, { status: 501 });
    }

    const data = await loadCostumeCreationsData(orgId, production);
    // Whole-production worklist (no maker filter) — estimate every missing yardage.
    const worklist = buildMakeWorklist(
      data.roles,
      data.designs,
      data.castings,
      data.performers,
      data.casts,
      data.initialPieces,
    );

    // Existing rows, by piece key, so we can merge each estimate onto current fields.
    const pieceByKey = new Map(
      data.initialPieces.map((p) => [pieceKey(p.casting_id, p.costume_design_id), p]),
    );

    // Select make-items with no yardage yet (never overwrite a human entry).
    const toEstimate: EstimateItem[] = [];
    for (const role of worklist.roles) {
      for (const garment of role.garments) {
        for (const item of garment.items) {
          if (item.fabric.yardage != null) continue;
          toEstimate.push({
            key: pieceKey(item.castingId, item.designId),
            garment: garment.designName,
            fabricWidth: item.fabric.width,
            measurements: (data.measurementsByCasting[item.castingId] ?? []).map((m) => ({
              label: m.label,
              value: m.value,
              unit: m.unit,
            })),
          });
        }
      }
    }

    if (toEstimate.length === 0) {
      return NextResponse.json({ pieces: data.initialPieces, estimated: 0 });
    }

    const estimates = await estimateFabricYardage(toEstimate);

    let estimated = 0;
    for (const it of toEstimate) {
      const yardage = estimates.get(it.key);
      if (yardage == null) continue;
      // pieceKey is `${castingId}:${designId}`; UUIDs contain no colon.
      const [castingId, designId] = it.key.split(":");
      const existing = pieceByKey.get(it.key);
      await upsertPieceSource({
        designId,
        castingId,
        source: existing?.source ?? "make",
        sourceNote: existing?.source_note ?? null,
        fabricType: existing?.fabric_type ?? null,
        fabricColor: existing?.fabric_color ?? null,
        fabricWidth: existing?.fabric_width ?? null,
        fabricSupplier: existing?.fabric_supplier ?? null,
        fabricYardage: yardage,
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        made: existing?.made ?? false,
        makerId: existing?.maker_id ?? null,
      });
      estimated += 1;
    }

    const pieces = await listCostumePieces(data.designs.map((d) => d.id));
    return NextResponse.json({ pieces, estimated });
  } catch (err) {
    return errorResponse(err);
  }
}
