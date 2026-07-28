// Pure builders for the PUT /api/productions/[id]/pieces request body, used by
// RoleCostumePanel wherever an action changes only *one* attribute of a piece
// (source, maker, made, purchase price) and must not disturb anything else
// already recorded for it — most importantly the skirt construction/fullness/
// length set on the Tailor's Summary page, which lives in the same row.
//
// This exists as a standalone, pure module (rather than inline object literals
// in the component) so the "preserve everything recorded" contract is directly
// unit-testable: RoleCostumePanel has no automated test coverage (no DOM test
// environment in this repo), so a bug in the body it sends can only be caught
// here, at the function that actually builds it.
import type { CostumePiece } from "@/lib/data/costume-pieces";

export interface SetSourceBody {
  designId: string;
  castingId: string;
  source: string;
  sharedWithCastingId: string | null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  skirtConstruction: string | null;
  skirtFullness: number | null;
  skirtLengthIn: number | null;
  purchasePrice: number | null;
  made: boolean;
  makerId: string | null;
}

// Body for changing a piece's *source* (the Costume tab's source dropdown /
// share-with picker). Every fabric + skirt + purchase + maker field already
// recorded for the piece is carried forward unchanged; only `source` (and
// `sharedWithCastingId`) reflect the new choice. When there is no existing row
// yet, every preserved field resolves to its lazy default, matching a fresh
// piece.
export function buildSetSourceBody(
  designId: string,
  castingId: string,
  source: string,
  sharedWithCastingId: string | null,
  existing: CostumePiece | undefined,
): SetSourceBody {
  return {
    designId,
    castingId,
    source,
    sharedWithCastingId,
    fabricType: existing?.fabric_type ?? null,
    fabricColor: existing?.fabric_color ?? null,
    fabricWidth: existing?.fabric_width ?? null,
    fabricSupplier: existing?.fabric_supplier ?? null,
    fabricYardage: existing?.fabric_yardage ?? null,
    fabricUnitCost: existing?.fabric_unit_cost ?? null,
    skirtConstruction: existing?.skirt_construction ?? null,
    skirtFullness: existing?.skirt_fullness ?? null,
    skirtLengthIn: existing?.skirt_length_in ?? null,
    purchasePrice: existing?.purchase_price ?? null,
    made: existing?.made ?? false,
    makerId: existing?.maker_id ?? null,
  };
}

export interface SetPieceFieldPatch {
  makerId?: string | null;
  made?: boolean;
  purchasePrice?: number | null;
}

export interface SetPieceFieldBody {
  designId: string;
  castingId: string;
  source: string;
  sharedWithCastingId: null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  skirtConstruction: string | null;
  skirtFullness: number | null;
  skirtLengthIn: number | null;
  purchasePrice: number | null;
  made: boolean;
  makerId: string | null;
}

// Body for changing a single field (maker, made, purchase price) — the Costume
// tab's maker picker, made checkbox, and purchase-price input all funnel
// through here. `patch` overrides only the field being changed; source and
// every fabric/skirt field come from the existing row unchanged.
export function buildSetPieceFieldBody(
  designId: string,
  castingId: string,
  existing: CostumePiece | undefined,
  patch: SetPieceFieldPatch,
): SetPieceFieldBody {
  return {
    designId,
    castingId,
    source: existing?.source ?? "make", // preserve source (e.g. "purchase") when toggling made/maker
    sharedWithCastingId: null,
    fabricType: existing?.fabric_type ?? null,
    fabricColor: existing?.fabric_color ?? null,
    fabricWidth: existing?.fabric_width ?? null,
    fabricSupplier: existing?.fabric_supplier ?? null,
    fabricYardage: existing?.fabric_yardage ?? null,
    fabricUnitCost: existing?.fabric_unit_cost ?? null,
    skirtConstruction: existing?.skirt_construction ?? null,
    skirtFullness: existing?.skirt_fullness ?? null,
    skirtLengthIn: existing?.skirt_length_in ?? null,
    purchasePrice:
      patch.purchasePrice !== undefined ? patch.purchasePrice : existing?.purchase_price ?? null,
    made: patch.made !== undefined ? patch.made : existing?.made ?? false,
    makerId: patch.makerId !== undefined ? patch.makerId : existing?.maker_id ?? null,
  };
}
