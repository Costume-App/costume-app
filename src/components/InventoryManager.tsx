"use client";

import { useEffect, useState } from "react";
import { PhotoStrip } from "@/components/PhotoStrip";

export interface InventoryRow {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
}

export function InventoryManager({ initialItems }: { initialItems: InventoryRow[] }) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const { item } = (await res.json()) as { item: InventoryRow };
      setItems((prev) => [...prev, item]);
      setNewName("");
      setAdding(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add item");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this item? Pieces already pulled from it stay, but lose the link.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    else setError("Couldn't remove item");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm muted">No items yet. Add your on-hand stock below.</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <InventoryCard key={item.id} item={item} busy={busy} onRemove={() => remove(item.id)} />
        ))}
      </ul>
      {adding ? (
        <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
          <input
            autoFocus
            className="field min-w-0 flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name (e.g. Top hat)"
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">Add item</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(""); }} className="link-muted shrink-0 text-sm">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="link-muted text-sm">
          + add item
        </button>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function InventoryCard({ item, busy, onRemove }: { item: InventoryRow; busy: boolean; onRemove: () => void }) {
  const [usage, setUsage] = useState<{ designId: string; productionName: string; roleName: string }[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${item.id}/usage`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { usage: [] }))
      .then((d) => { if (active) setUsage(d.usage ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [item.id]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  }

  return (
    <li className="surface !shadow-none space-y-2 p-3">
      <div className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 font-medium"
          defaultValue={item.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && patch({ name: e.target.value })}
          aria-label="Item name"
        />
        <button type="button" onClick={onRemove} disabled={busy} className="shrink-0 text-sm text-[var(--red)] hover:underline disabled:opacity-50">
          Remove
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className="field" defaultValue={item.category ?? ""} placeholder="Category"
          onBlur={(e) => e.target.value !== (item.category ?? "") && patch({ category: e.target.value })} aria-label="Category" />
        <input className="field" defaultValue={item.size ?? ""} placeholder="Size"
          onBlur={(e) => e.target.value !== (item.size ?? "") && patch({ size: e.target.value })} aria-label="Size" />
        <input className="field" type="number" min={0} defaultValue={item.quantity} placeholder="Qty"
          onBlur={(e) => Number(e.target.value) !== item.quantity && patch({ quantity: Number(e.target.value) })} aria-label="Quantity" />
        <input className="field" defaultValue={item.location ?? ""} placeholder="Location"
          onBlur={(e) => e.target.value !== (item.location ?? "") && patch({ location: e.target.value })} aria-label="Location" />
      </div>
      <textarea className="field w-full text-sm" rows={2} defaultValue={item.notes ?? ""} placeholder="Notes (optional)"
        onBlur={(e) => e.target.value !== (item.notes ?? "") && patch({ notes: e.target.value })} aria-label="Notes" />
      <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} label="Photos" />
      {usage.length > 0 && (
        <p className="text-xs muted">
          Used in: {usage.map((u) => `${u.productionName} → ${u.roleName}`).join(", ")}
        </p>
      )}
    </li>
  );
}
