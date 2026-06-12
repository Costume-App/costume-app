import { pieceKey } from "@/lib/costume-merge";
import { defaultSourceFor, type CostumeSource } from "@/lib/costume-sources";

export interface PieceRow {
  costume_design_id: string;
  casting_id: string;
  source: CostumeSource;
  fabric_type: string | null;
  fabric_color: string | null;
  fabric_width: string | null;
  fabric_supplier: string | null;
  fabric_yardage: number | null;
  fabric_unit_cost: number | null;
  purchase_price: number | null;
  made: boolean;
  maker_id: string | null;
  added_inventory_item_id: string | null;
}

export interface Fabric {
  type: string | null;
  color: string | null;
  width: string | null;
  supplier: string | null;
  yardage: number | null;
  unitCost: number | null;
}

export interface MakeItem {
  designId: string;
  castingId: string;
  performerId: string;
  performerName: string;
  castName: string;
  assignment: "primary" | "understudy";
  made: boolean;
  makerId: string | null;
  addedInventoryItemId: string | null;
  fabric: Fabric;
}

export interface WorklistGarment {
  designId: string;
  designName: string;
  items: MakeItem[];
}

export interface WorklistRole {
  roleId: string;
  roleName: string;
  notes: string | null;
  garments: WorklistGarment[];
}

export interface Worklist {
  roles: WorklistRole[];
  totalItems: number;
  madeItems: number;
}

export interface FabricLine {
  type: string;
  color: string | null;
  width: string | null;
  supplier: string | null;
  totalYardage: number;
  estCost: number;
  pieceCount: number;
}

// A type+color group: its detail lines (split by width/supplier) plus a subtotal.
export interface FabricGroup {
  type: string;
  color: string | null;
  lines: FabricLine[];
  totalYardage: number;
  estCost: number;
}

export interface PurchaseList {
  groups: FabricGroup[];
  unspecified: MakeItem[];
  totalYardage: number;
  totalCost: number;
}

export interface PurchasedItem {
  designId: string;
  castingId: string;
  designName: string;
  performerName: string;
  castName: string;
  roleName: string;
  price: number | null;
  purchased: boolean;
}

export interface PurchasedSummary {
  items: PurchasedItem[];
  totalCost: number;
}

interface RoleLike { id: string; name: string; notes: string | null }
interface DesignLike { id: string; role_id: string; name: string; display_order: number; inventory_item_id: string | null }
interface CastingLike { id: string; cast_id: string; role_id: string; performer_id: string; assignment: "primary" | "understudy" }
interface PerformerLike { id: string; name: string }
interface CastLike { id: string; name: string }

export interface MeasurementView {
  key: string;
  label: string;
  value: number;
  unit: string;
}

interface MeasurementDefLike { key: string; label: string; display_order: number }
interface MeasurementRowLike { performer_id: string; measurement_key: string; value_numeric: number; unit: string }
interface CastingPerformerLike { id: string; performer_id: string }

// Map each casting to its performer's filled measurements, ordered by the
// definition display order. Castings whose performer has no measurements are omitted.
export function buildMeasurementsByCasting(
  definitions: MeasurementDefLike[],
  measurements: MeasurementRowLike[],
  castings: CastingPerformerLike[],
): Record<string, MeasurementView[]> {
  const order = new Map(definitions.map((d) => [d.key, d.display_order]));
  const label = new Map(definitions.map((d) => [d.key, d.label]));
  const sorted = [...measurements].sort(
    (a, b) => (order.get(a.measurement_key) ?? 999) - (order.get(b.measurement_key) ?? 999),
  );
  const byPerformer = new Map<string, MeasurementView[]>();
  for (const m of sorted) {
    const view: MeasurementView = {
      key: m.measurement_key,
      label: label.get(m.measurement_key) ?? m.measurement_key,
      value: m.value_numeric,
      unit: m.unit,
    };
    const arr = byPerformer.get(m.performer_id) ?? [];
    arr.push(view);
    byPerformer.set(m.performer_id, arr);
  }
  const out: Record<string, MeasurementView[]> = {};
  for (const c of castings) {
    const views = byPerformer.get(c.performer_id);
    if (views && views.length > 0) out[c.id] = views;
  }
  return out;
}

const EMPTY_FABRIC: Fabric = {
  type: null, color: null, width: null, supplier: null, yardage: null, unitCost: null,
};

function fabricFromRow(row: PieceRow | undefined): Fabric {
  if (!row) return EMPTY_FABRIC;
  return {
    type: row.fabric_type,
    color: row.fabric_color,
    width: row.fabric_width,
    supplier: row.fabric_supplier,
    yardage: row.fabric_yardage,
    unitCost: row.fabric_unit_cost,
  };
}

// Build the production-wide make worklist: for every (design × casting of that
// design's role, across all casts), include it unless its stored source is
// on_hand/shared. Absence of a row uses defaultSourceFor — inventory-linked
// designs default to on_hand, everything else to make.
export function buildMakeWorklist(
  roles: RoleLike[],
  designs: DesignLike[],
  castings: CastingLike[],
  performers: PerformerLike[],
  casts: CastLike[],
  pieces: PieceRow[],
  opts: { makerId?: string } = {},
): Worklist {
  const pieceMap = new Map<string, PieceRow>();
  for (const p of pieces) pieceMap.set(pieceKey(p.casting_id, p.costume_design_id), p);
  const performerName = new Map(performers.map((p) => [p.id, p.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));

  let totalItems = 0;
  let madeItems = 0;
  const roleOut: WorklistRole[] = [];

  for (const role of roles) {
    const roleDesigns = designs
      .filter((d) => d.role_id === role.id)
      .sort((a, b) => a.display_order - b.display_order);
    const roleCastings = castings.filter((c) => c.role_id === role.id);
    const garments: WorklistGarment[] = [];

    for (const design of roleDesigns) {
      const items: MakeItem[] = [];
      for (const casting of roleCastings) {
        const row = pieceMap.get(pieceKey(casting.id, design.id));
        const source = row?.source ?? defaultSourceFor(design);
        if (source !== "make") continue; // only make pieces are tailor work (on_hand/shared/purchase excluded)
        if (opts.makerId && row?.maker_id !== opts.makerId) continue; // My Work: only this maker's pieces
        const made = row?.made ?? false;
        items.push({
          designId: design.id,
          castingId: casting.id,
          performerId: casting.performer_id,
          performerName: performerName.get(casting.performer_id) ?? "—",
          castName: castName.get(casting.cast_id) ?? "—",
          assignment: casting.assignment,
          made,
          makerId: row?.maker_id ?? null,
          addedInventoryItemId: row?.added_inventory_item_id ?? null,
          fabric: fabricFromRow(row),
        });
        totalItems += 1;
        if (made) madeItems += 1;
      }
      if (items.length > 0) garments.push({ designId: design.id, designName: design.name, items });
    }

    if (garments.length > 0) {
      roleOut.push({ roleId: role.id, roleName: role.name, notes: role.notes, garments });
    }
  }

  return { roles: roleOut, totalItems, madeItems };
}

// Gather every purchase-source piece into a flat priced list. Purchase is always
// an explicit source (never a lazy default), so absence of a row contributes
// nothing here. Ordered by role, then design display order, then casting order.
export function buildPurchaseWorklist(
  roles: RoleLike[],
  designs: DesignLike[],
  castings: CastingLike[],
  performers: PerformerLike[],
  casts: CastLike[],
  pieces: PieceRow[],
): PurchasedSummary {
  const pieceMap = new Map<string, PieceRow>();
  for (const p of pieces) pieceMap.set(pieceKey(p.casting_id, p.costume_design_id), p);
  const performerName = new Map(performers.map((p) => [p.id, p.name]));
  const castName = new Map(casts.map((c) => [c.id, c.name]));

  const items: PurchasedItem[] = [];
  let totalCost = 0;

  for (const role of roles) {
    const roleDesigns = designs
      .filter((d) => d.role_id === role.id)
      .sort((a, b) => a.display_order - b.display_order);
    const roleCastings = castings.filter((c) => c.role_id === role.id);

    for (const design of roleDesigns) {
      for (const casting of roleCastings) {
        const row = pieceMap.get(pieceKey(casting.id, design.id));
        if (row?.source !== "purchase") continue;
        const price = row.purchase_price;
        items.push({
          designId: design.id,
          castingId: casting.id,
          designName: design.name,
          performerName: performerName.get(casting.performer_id) ?? "—",
          castName: castName.get(casting.cast_id) ?? "—",
          roleName: role.name,
          price,
          purchased: row.made,
        });
        totalCost += price ?? 0;
      }
    }
  }

  return { items, totalCost };
}

function norm(s: string | null): string {
  return (s ?? "").trim();
}

// Aggregate make-items into a fabric shopping list. Detail lines are grouped by
// type+color+width+supplier; those lines are then grouped (and subtotaled) by
// type+color. Items without a fabric type are "unspecified".
export function buildFabricPurchaseList(
  items: MakeItem[],
  supplierPrices: Record<string, number> = {},
): PurchaseList {
  const lines = new Map<string, FabricLine>();
  const unspecified: MakeItem[] = [];
  let totalYardage = 0;
  let totalCost = 0;

  for (const item of items) {
    const type = norm(item.fabric.type);
    if (!type) {
      unspecified.push(item);
      continue;
    }
    const color = norm(item.fabric.color);
    const width = norm(item.fabric.width);
    const supplier = norm(item.fabric.supplier);
    const key = [type, color, width, supplier].join("|");
    const yardage = item.fabric.yardage ?? 0;
    const effectiveUnitCost =
      item.fabric.unitCost ?? (item.fabric.supplier ? supplierPrices[item.fabric.supplier.trim()] : undefined) ?? 0;
    const cost = yardage * effectiveUnitCost;

    const existing = lines.get(key);
    if (existing) {
      existing.totalYardage += yardage;
      existing.estCost += cost;
      existing.pieceCount += 1;
    } else {
      lines.set(key, {
        type,
        color: color || null,
        width: width || null,
        supplier: supplier || null,
        totalYardage: yardage,
        estCost: cost,
        pieceCount: 1,
      });
    }
    totalYardage += yardage;
    totalCost += cost;
  }

  // Group the detail lines (and subtotal) by type+color.
  const groups = new Map<string, FabricGroup>();
  for (const line of lines.values()) {
    const gkey = [line.type, line.color ?? ""].join("|");
    const group = groups.get(gkey);
    if (group) {
      group.lines.push(line);
      group.totalYardage += line.totalYardage;
      group.estCost += line.estCost;
    } else {
      groups.set(gkey, {
        type: line.type,
        color: line.color,
        lines: [line],
        totalYardage: line.totalYardage,
        estCost: line.estCost,
      });
    }
  }

  return { groups: [...groups.values()], unspecified, totalYardage, totalCost };
}
