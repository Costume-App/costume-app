"use client";

import { useEffect, useState } from "react";
import { PhotoStrip } from "@/components/PhotoStrip";
import type { InventoryRow } from "@/lib/inventory-grouping";

/** Shared <datalist> id; InventoryManager renders the matching <datalist>. */
export const CATEGORY_DATALIST_ID = "inventory-categories";

export function InventoryItemDetail({
  item,
  busy,
  onChange,
  onRemove,
}: {
  item: InventoryRow;
  busy: boolean;
  onChange: (patch: Partial<InventoryRow>) => void;
  onRemove: () => void;
}) {
  const [usage, setUsage] = useState<{ productionName: string; roleName: string }[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${item.id}/usage`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { usage: [] }))
      .then((d) => { if (active) setUsage(d.usage ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [item.id]);

  async function patch(body: Partial<InventoryRow>) {
    // Snapshot the prior values so we can roll the parent list back if the save fails.
    const prev = (Object.keys(body) as (keyof InventoryRow)[]).reduce<Partial<InventoryRow>>(
      (acc, k) => ({ ...acc, [k]: item[k] }),
      {},
    );
    onChange(body); // optimistic
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) onChange(prev);
  }

  return (
    <div className="surface !shadow-none space-y-2 p-3">
      <input
        className="field w-full font-medium"
        defaultValue={item.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && patch({ name: e.target.value })}
        aria-label="Item name"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className="field" list={CATEGORY_DATALIST_ID} defaultValue={item.category ?? ""} placeholder="Category"
          onBlur={(e) => e.target.value !== (item.category ?? "") && patch({ category: e.target.value.trim() || null })} aria-label="Category" />
        <input className="field" defaultValue={item.size ?? ""} placeholder="Size"
          onBlur={(e) => e.target.value !== (item.size ?? "") && patch({ size: e.target.value.trim() || null })} aria-label="Size" />
        <input className="field" type="number" min={0} defaultValue={item.quantity} placeholder="Qty"
          onBlur={(e) => Number(e.target.value) !== item.quantity && patch({ quantity: Number(e.target.value) })} aria-label="Quantity" />
        <input className="field" defaultValue={item.location ?? ""} placeholder="Location"
          onBlur={(e) => e.target.value !== (item.location ?? "") && patch({ location: e.target.value.trim() || null })} aria-label="Location" />
      </div>
      <textarea className="field w-full text-sm" rows={2} defaultValue={item.notes ?? ""} placeholder="Notes (optional)"
        onBlur={(e) => e.target.value !== (item.notes ?? "") && patch({ notes: e.target.value.trim() || null })} aria-label="Notes" />
      <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} label="Photos" />
      {usage.length > 0 && (
        <p className="text-xs muted">
          Used in: {usage.map((u) => `${u.productionName} → ${u.roleName}`).join(", ")}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onRemove} disabled={busy}
          className="text-sm text-[var(--red)] hover:underline disabled:opacity-50">
          Remove item
        </button>
      </div>
    </div>
  );
}
