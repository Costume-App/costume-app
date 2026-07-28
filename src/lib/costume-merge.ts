import type { CostumeSource } from "@/lib/costume-sources";

interface DesignLike {
  id: string;
  role_id: string;
}
interface PieceRowLike {
  id?: string;
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  shared_with_piece_id: string | null;
  source_note: string | null;
}

export interface ResolvedSource {
  source: CostumeSource;
  sharedWithPieceId: string | null;
  sourceNote: string | null;
}

// Stable key for a (casting, design) cell.
export function pieceKey(castingId: string, designId: string): string {
  return `${castingId}:${designId}`;
}

// Stored rows only; absence means "make" (the caller defaults).
export function resolvePieceSources(pieces: PieceRowLike[]): Record<string, ResolvedSource> {
  const map: Record<string, ResolvedSource> = {};
  for (const p of pieces) {
    map[pieceKey(p.casting_id, p.costume_design_id)] = {
      source: p.source,
      sharedWithPieceId: p.shared_with_piece_id,
      sourceNote: p.source_note,
    };
  }
  return map;
}

export function pieceCountByRole(designs: DesignLike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of designs) counts[d.role_id] = (counts[d.role_id] ?? 0) + 1;
  return counts;
}

// True when a costume_pieces row carries no meaningful data and can be deleted
// (the lazy default: absence of a row means "make"). Note must already be trimmed
// to null when blank.
export function pieceRowIsEmpty(input: {
  source: CostumeSource;
  sourceNote: string | null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  made: boolean;
  makerId: string | null;
  skirtConstruction: string | null;
}): boolean {
  const hasFabric =
    !!(input.fabricType || input.fabricColor || input.fabricWidth || input.fabricSupplier) ||
    input.fabricYardage != null ||
    input.fabricUnitCost != null;
  return (
    input.source === "make" &&
    !input.sourceNote &&
    !hasFabric &&
    !input.made &&
    !input.makerId &&
    !input.skirtConstruction
  );
}
