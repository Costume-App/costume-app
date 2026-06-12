"use client";

import { useState } from "react";
import Link from "next/link";
import { InventoryItemDetail } from "@/components/InventoryItemDetail";
import type { InventoryRow } from "@/lib/inventory-grouping";

export function InventoryQuickAddCard({ itemCount }: { itemCount: number }) {
  const [count, setCount] = useState(itemCount);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<InventoryRow | null>(null);
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
      setCount((c) => c + 1);
      setAdded(item);
      setNewName("");
      setAdding(false); // show the inline editor in place of the add form
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add item");
    }
    setBusy(false);
  }

  async function discardAdded() {
    if (!added) return;
    await fetch(`/api/inventory/${added.id}`, { method: "DELETE", credentials: "include" }).catch(() => {});
    setCount((c) => Math.max(0, c - 1));
    setAdded(null);
  }

  return (
    <div className="surface mt-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/inventory" className="group min-w-0">
          <span className="font-display text-xl font-semibold group-hover:underline">House Inventory →</span>
          <span className="mt-0.5 block text-sm muted">
            {count === 0 ? "No items yet" : `${count} item${count === 1 ? "" : "s"} on hand`}
          </span>
        </Link>
        {!adding && !added && (
          <button type="button" onClick={() => { setAdding(true); setAdded(null); }} className="link-muted shrink-0 text-sm">
            + Add to inventory
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--field-line)] pt-3">
          <input
            autoFocus
            className="field min-w-0 flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name (e.g. Top hat)"
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">Add item</button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(""); setError(null); }}
            className="link-muted shrink-0 text-sm"
          >
            Done
          </button>
        </form>
      )}

      {added && (
        <div className="mt-3 space-y-2 border-t border-[var(--field-line)] pt-3">
          <p className="text-sm muted">
            Added ✓ <strong>{added.name}</strong> — add details &amp; photos:
          </p>
          <InventoryItemDetail
            item={added}
            busy={busy}
            onChange={(patch) => setAdded((prev) => (prev ? { ...prev, ...patch } : prev))}
            onRemove={() => void discardAdded()}
          />
          <button type="button" onClick={() => setAdded(null)} className="btn-primary text-sm">
            Done
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
