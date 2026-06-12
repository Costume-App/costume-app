"use client";

import { useMemo, useState } from "react";
import {
  filterItemsByName,
  groupItemsByCategory,
  uniqueCategories,
  type InventoryRow,
} from "@/lib/inventory-grouping";
import { CATEGORY_DATALIST_ID, InventoryItemDetail } from "@/components/InventoryItemDetail";

export type { InventoryRow };

export function InventoryManager({ initialItems }: { initialItems: InventoryRow[] }) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searching = query.trim().length > 0;
  const groups = useMemo(() => groupItemsByCategory(filterItemsByName(items, query)), [items, query]);
  const categories = useMemo(() => uniqueCategories(items), [items]);

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
      setExpandedId(item.id);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add item");
    }
    setBusy(false);
  }

  function updateItem(id: string, patch: Partial<InventoryRow>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function remove(id: string) {
    if (!confirm("Remove this item? Pieces already pulled from it stay, but lose the link.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setExpandedId((cur) => (cur === id ? null : cur));
    } else {
      setError("Couldn't remove item");
    }
    setBusy(false);
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input
        className="field w-full"
        placeholder="Search inventory…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search inventory"
      />
      <datalist id={CATEGORY_DATALIST_ID}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {items.length === 0 && <p className="text-sm muted">No items yet. Add your on-hand stock below.</p>}
      {items.length > 0 && groups.length === 0 && (
        <p className="text-sm muted">No items match &ldquo;{query.trim()}&rdquo;.</p>
      )}

      {groups.map((group) => {
        const isCollapsed = !searching && collapsed.has(group.key);
        return (
          <div key={group.key} className="space-y-1.5">
            <button
              type="button"
              onClick={() => toggleCollapse(group.key)}
              disabled={searching}
              className="flex w-full items-center gap-2 border-b border-[var(--field-line)] pb-1.5 text-left disabled:cursor-default"
            >
              <span className="lbl">{group.label}</span>
              <span className="text-xs muted">
                · {group.items.length}
                {searching ? (group.items.length === 1 ? " match" : " matches") : ""}
              </span>
              {!searching && <span className="ml-auto text-sm muted">{isCollapsed ? "›" : "⌄"}</span>}
            </button>
            {!isCollapsed && (
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                      className="surface !shadow-none flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-[var(--bg)]"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs muted">
                        {[item.size, `×${item.quantity}`].filter(Boolean).join(" · ")}
                      </span>
                      <span className="shrink-0 text-sm muted">{expandedId === item.id ? "⌄" : "›"}</span>
                    </button>
                    {expandedId === item.id && (
                      <div className="mt-1.5">
                        <InventoryItemDetail
                          item={item}
                          busy={busy}
                          onChange={(patch) => updateItem(item.id, patch)}
                          onRemove={() => remove(item.id)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

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
