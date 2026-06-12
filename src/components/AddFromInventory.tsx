"use client";

import { useState } from "react";

interface PickItem {
  id: string;
  name: string;
  category: string | null;
  thumbUrl: string | null;
}

export function AddFromInventory({ onPick, busy }: { onPick: (itemId: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", { credentials: "include" });
      if (res.ok) {
        const { items } = (await res.json()) as { items: PickItem[] };
        setItems(items);
      } else {
        setError("Couldn't load inventory");
      }
    } catch {
      setError("Couldn't load inventory");
    }
    setLoading(false);
  }

  const q = filter.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
    : items;

  if (!open) {
    return (
      <button type="button" onClick={openPicker} disabled={busy} className="ml-4 link-muted text-sm disabled:opacity-50">
        + add from inventory
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--field-line)] p-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="field min-w-0 flex-1 !p-1.5 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search inventory…"
        />
        <button type="button" onClick={() => setOpen(false)} className="link-muted shrink-0 text-sm">
          Close
        </button>
      </div>
      {loading && <p className="text-xs muted">Loading…</p>}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="text-xs muted">No items{q ? " match" : " in inventory yet"}.</p>
      )}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => { onPick(i.id); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-[var(--bg)] disabled:opacity-50"
            >
              {i.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumbUrl} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <div className="h-9 w-9 rounded bg-[var(--bg)]" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              {i.category && <span className="shrink-0 text-xs muted">{i.category}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
