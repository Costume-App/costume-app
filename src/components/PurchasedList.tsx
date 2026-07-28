"use client";

import { useState } from "react";
import type { PurchasedItem, PieceRow } from "@/lib/tailor-summary";

function money(n: number): string {
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}

function PriceRow({
  productionId,
  item,
  onSaved,
}: {
  productionId: string;
  item: PurchasedItem;
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  const [value, setValue] = useState(item.price != null ? item.price.toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) return; // ignore bad input
    const next = parsed != null ? Math.round(parsed * 100) / 100 : null; // round to cents
    if ((item.price ?? null) === next) {
      setValue(next != null ? next.toFixed(2) : ""); // normalize display, no save
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/pieces`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          designId: item.designId,
          castingId: item.castingId,
          source: "purchase",
          sharedWithCastingId: null,
          made: item.purchased,
          purchasePrice: next,
          // A "purchase" piece isn't necessarily construction-free: it can carry
          // a skirt construction, its calculated_yardage, and a fabric_yardage
          // (hand-typed or calculator-derived) left over from before it was
          // switched from "make" (RoleCostumePanel now preserves those fields
          // on that switch). Omitting any of them here would null them on this
          // save — for fabricYardage that's not a "fails safe" gap, it's the
          // exact under-buy shape this whole feature is calibrated against —
          // so this save preserves all five the same way the PUT bodies
          // elsewhere do. It does NOT preserve fabricType, fabricColor,
          // fabricWidth, fabricSupplier, fabricUnitCost, or makerId —
          // `PurchasedItem` carries none of those, so this save nulls them
          // same as it always has. That IS pre-existing and fails safe (a
          // purchased piece has no maker or fabric-shopping fields to lose,
          // only a quantity), not a gap introduced here; widening
          // `PurchasedItem` to carry them too is out of scope.
          skirtConstruction: item.skirtConstruction,
          skirtFullness: item.skirtFullness,
          skirtLengthIn: item.skirtLengthIn,
          calculatedYardage: item.calculatedYardage,
          fabricYardage: item.fabricYardage,
        }),
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
        return;
      }
      const { piece } = (await res.json()) as { piece: PieceRow | null };
      setValue(next != null ? next.toFixed(2) : "");
      onSaved(item.designId, item.castingId, piece);
    } catch {
      setError("Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-[var(--field-line)]">
      <td className="py-1.5">{item.designName}</td>
      <td className="py-1.5">
        {item.performerName} · {item.roleName}
      </td>
      <td className="py-1.5 pr-2 text-right">
        <label className="inline-flex items-center gap-1">
          <span className="muted">$</span>
          <input
            className="field !p-1.5 w-20 text-right text-sm"
            value={value}
            disabled={busy}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void save()}
            aria-label={`Price for ${item.designName} (${item.performerName})`}
          />
        </label>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      </td>
    </tr>
  );
}

export function PurchasedList({
  productionId,
  items,
  totalCost,
  onSaved,
}: {
  productionId: string;
  items: PurchasedItem[];
  totalCost: number;
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="lbl">Purchased items ({items.length})</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left muted">
            <th className="pb-1 font-normal">Piece</th>
            <th className="pb-1 font-normal">Who</th>
            <th className="pb-1 pr-2 text-right font-normal">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <PriceRow
              key={`${it.designId}:${it.castingId}`}
              productionId={productionId}
              item={it}
              onSaved={onSaved}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--ink)] font-semibold">
            <td className="py-1.5" colSpan={2}>
              Purchased subtotal
            </td>
            <td className="py-1.5 pr-2 text-right">{money(totalCost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
