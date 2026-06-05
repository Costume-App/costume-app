import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import type { CostumeSource } from "@/lib/costume-sources";

export interface CostumePiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  shared_with_piece_id: string | null;
  source_note: string | null;
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

// Upsert a performer's source for a design. `make` with no note clears the row
// (lazy default). For `shared`, references the borrowed *performer* (casting).
// Returns the row, or null when cleared.
export async function upsertPieceSource(input: {
  designId: string;
  castingId: string;
  source: CostumeSource;
  sharedWithCastingId?: string | null;
  sourceNote?: string | null;
}): Promise<CostumePiece | null> {
  const note = input.sourceNote?.trim() ? input.sourceNote.trim() : null;

  if (input.source === "make" && !note) {
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "costume_design_id,casting_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumePiece;
}
