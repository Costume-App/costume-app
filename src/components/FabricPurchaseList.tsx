"use client";

import type { PurchaseList } from "@/lib/tailor-summary";

function formatYards(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function FabricPurchaseList({ purchase }: { purchase: PurchaseList }) {
  if (purchase.lines.length === 0 && purchase.unspecified.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
        No fabric to buy yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {purchase.lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left muted">
              <th className="pb-1 font-normal">Fabric</th>
              <th className="pb-1 font-normal">Color</th>
              <th className="pb-1 font-normal">Width</th>
              <th className="pb-1 text-right font-normal">Yards</th>
              <th className="pb-1 text-right font-normal">Est. $</th>
              <th className="pb-1 font-normal">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((l, i) => (
              <tr key={i} className="border-t border-[var(--field-line)]">
                <td className="py-1.5">{l.type}</td>
                <td className="py-1.5">{l.color ?? "—"}</td>
                <td className="py-1.5">{l.width ?? "—"}</td>
                <td className="py-1.5 text-right">{formatYards(l.totalYardage)}</td>
                <td className="py-1.5 text-right">{l.estCost > 0 ? `$${l.estCost.toFixed(2)}` : "—"}</td>
                <td className="py-1.5">{l.supplier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--ink)] font-semibold">
              <td className="py-1.5" colSpan={3}>
                Total
              </td>
              <td className="py-1.5 text-right">{formatYards(purchase.totalYardage)}</td>
              <td className="py-1.5 text-right">
                {purchase.totalCost > 0 ? `$${purchase.totalCost.toFixed(2)}` : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {purchase.unspecified.length > 0 && (
        <div className="space-y-1">
          <p className="lbl">Fabric not specified yet ({purchase.unspecified.length})</p>
          <ul className="text-sm muted">
            {purchase.unspecified.map((it) => (
              <li key={`${it.designId}:${it.castingId}`}>
                {it.performerName} · {it.castName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
