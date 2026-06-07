import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import type { CostumeSource } from "@/lib/costume-sources";
import { pieceRowIsEmpty } from "@/lib/costume-merge";

export interface CostumePiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  shared_with_piece_id: string | null;
  source_note: string | null;
  fabric_type: string | null;
  fabric_color: string | null;
  fabric_width: string | null;
  fabric_supplier: string | null;
  fabric_yardage: number | null;
  fabric_unit_cost: number | null;
  made: boolean;
  made_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCostumePieces(designIds: string[]): Promise<CostumePiece[]> {
  if (designIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("costume_pieces")
    .select("*")
    .in("costume_design_id", designIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumePiece[];
}

// OPTION 1: borrower references the target *performer* (casting). Ensure that
// performer's piece row exists (create as `make` if missing), then return its id.
// Rejects sharing from a piece that is itself shared (no chains).
async function ensureShareTarget(designId: string, targetCastingId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("id, source")
    .eq("costume_design_id", designId)
    .eq("casting_id", targetCastingId)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (existing) {
    const row = existing as { id: string; source: CostumeSource };
    if (row.source === "shared") throw new ValidationError("Cannot share a piece that is itself shared");
    return row.id;
  }
  const { data: created, error: insErr } = await supabaseAdmin
    .from("costume_pieces")
    .insert({ costume_design_id: designId, casting_id: targetCastingId, source: "make" })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return (created as { id: string }).id;
}

// Upsert a performer's piece (source + fabric + made). A fully-empty make row is
// deleted (lazy default). For `shared`, references the borrowed *performer* (casting).
// Returns the row, or null when cleared.
export async function upsertPieceSource(input: {
  designId: string;
  castingId: string;
  source: CostumeSource;
  sharedWithCastingId?: string | null;
  sourceNote?: string | null;
  fabricType?: string | null;
  fabricColor?: string | null;
  fabricWidth?: string | null;
  fabricSupplier?: string | null;
  fabricYardage?: number | null;
  fabricUnitCost?: number | null;
  made?: boolean;
}): Promise<CostumePiece | null> {
  const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);
  const num = (n?: number | null) =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  const note = clean(input.sourceNote);
  const fabricType = clean(input.fabricType);
  const fabricColor = clean(input.fabricColor);
  const fabricWidth = clean(input.fabricWidth);
  const fabricSupplier = clean(input.fabricSupplier);
  const fabricYardage = num(input.fabricYardage);
  const fabricUnitCost = num(input.fabricUnitCost);
  const made = input.made ?? false;

  if (
    pieceRowIsEmpty({
      source: input.source,
      sourceNote: note,
      fabricType,
      fabricColor,
      fabricWidth,
      fabricSupplier,
      fabricYardage,
      fabricUnitCost,
      made,
    })
  ) {
    const { error } = await supabaseAdmin
      .from("costume_pieces")
      .delete()
      .eq("costume_design_id", input.designId)
      .eq("casting_id", input.castingId);
    if (error) throw new Error(error.message);
    return null;
  }

  let sharedWith: string | null = null;
  if (input.source === "shared") {
    if (!input.sharedWithCastingId) throw new ValidationError("Pick whose piece this shares");
    if (input.sharedWithCastingId === input.castingId) {
      throw new ValidationError("Cannot share with yourself");
    }
    sharedWith = await ensureShareTarget(input.designId, input.sharedWithCastingId);
  }

  const { data, error } = await supabaseAdmin
    .from("costume_pieces")
    .upsert(
      {
        costume_design_id: input.designId,
        casting_id: input.castingId,
        source: input.source,
        shared_with_piece_id: sharedWith,
        source_note: note,
        fabric_type: fabricType,
        fabric_color: fabricColor,
        fabric_width: fabricWidth,
        fabric_supplier: fabricSupplier,
        fabric_yardage: fabricYardage,
        fabric_unit_cost: fabricUnitCost,
        made,
        made_at: made ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "costume_design_id,casting_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumePiece;
}
