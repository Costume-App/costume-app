"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  filterItemsByName,
  groupItemsByCategory,
  uniqueCategories,
  type InventoryRow,
} from "@/lib/inventory-grouping";
import { CATEGORY_DATALIST_ID, InventoryItemDetail } from "@/components/InventoryItemDetail";

export type { InventoryRow };

export function InventoryManager({
  initialItems,
  focusItemId,
}: {
  initialItems: InventoryRow[];
  focusItemId?: string;
}) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  // A freshly added item being filled in inline at the add form (hidden from the
  // list below until done, so it isn't shown twice).
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searching = query.trim().length > 0;
  const groups = useMemo(
    () => groupItemsByCategory(filterItemsByName(items.filter((i) => i.id !== justAddedId), query)),
    [items, query, justAddedId],
  );
  const categories = useMemo(() => uniqueCategories(items), [items]);

  useEffect(() => {
    if (!focusItemId || !items.some((i) => i.id === focusItemId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedId(focusItemId);
    document.getElementById(`inv-item-${focusItemId}`)?.scrollIntoView({ block: "center" });
    // run once on mount for the deep-linked item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Show the full editor inline right here (instead of expanding it down the list).
      setJustAddedId(item.id);
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
      {justAddedId ? (
        (() => {
          const justAdded = items.find((i) => i.id === justAddedId);
          if (!justAdded) return null;
          return (
            <div className="space-y-2">
              <p className="text-sm muted">
                Added ✓ <strong>{justAdded.name}</strong> — add details &amp; photos:
              </p>
              <InventoryItemDetail
                item={justAdded}
                busy={busy}
                onChange={(patch) => updateItem(justAdded.id, patch)}
                onRemove={() => { remove(justAdded.id); setJustAddedId(null); }}
              />
              <button type="button" onClick={() => setJustAddedId(null)} className="btn-primary text-sm">
                Done
              </button>
            </div>
          );
        })()
      ) : adding ? (
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
        <button type="button" onClick={() => setAdding(true)} className="btn-primary text-sm">
          + Add item
        </button>
      )}
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
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {group.items.map((item) => (
                  <Fragment key={item.id}>
                    <li id={`inv-item-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                        className={`surface !shadow-none block h-full w-full overflow-hidden text-left transition-colors hover:bg-[var(--bg)] ${
                          expandedId === item.id ? "ring-2 ring-[var(--red)]" : ""
                        }`}
                      >
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photoUrl} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <span className="flex aspect-square w-full items-center justify-center bg-[#8c2b22]/10 text-[var(--red)]">
                            <GarmentIcon />
                          </span>
                        )}
                        <span className="block p-2">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="block text-xs muted">
                            {[item.size, `×${item.quantity}`].filter(Boolean).join(" · ") || " "}
                          </span>
                        </span>
                      </button>
                    </li>
                    {expandedId === item.id && (
                      <li className="col-span-full">
                        <InventoryItemDetail
                          item={item}
                          busy={busy}
                          onChange={(patch) => updateItem(item.id, patch)}
                          onRemove={() => remove(item.id)}
                        />
                      </li>
                    )}
                  </Fragment>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="link-muted text-sm">
          + add item
        </button>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

// Placeholder for items with no photo yet: a simple garment outline.
function GarmentIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 3-4 3 2 4 2-1v9h8v-9l2 1 2-4-4-3a4 4 0 0 1-8 0Z" />
    </svg>
  );
}
