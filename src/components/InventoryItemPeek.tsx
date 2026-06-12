"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PhotoStrip } from "@/components/PhotoStrip";

interface PeekItem {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
}

// View-only popup of an inventory item, opened from a costume piece. Mirrors
// PhotoStrip's lightbox overlay (bg-black/70, click-out + Esc to close).
export function InventoryItemPeek({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [item, setItem] = useState<PeekItem | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${itemId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { item: PeekItem }) => { if (active) setItem(d.item); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [itemId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = item ? [item.category, item.size, `×${item.quantity}`].filter(Boolean).join(" · ") : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface max-h-[85vh] w-full max-w-md overflow-y-auto p-4"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{item?.name ?? "Inventory item"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-lg leading-none text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--red)]">Couldn&apos;t load this item.</p>
        ) : !item ? (
          <p className="text-sm muted">Loading…</p>
        ) : (
          <div className="space-y-2">
            <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} readOnly />
            {meta && <p className="text-sm muted">{meta}</p>}
            {item.location && (
              <p className="text-sm">
                <span className="muted">Location:</span> {item.location}
              </p>
            )}
            {item.notes && <p className="whitespace-pre-wrap text-sm">{item.notes}</p>}
            <Link href={`/inventory?item=${item.id}`} className="link-muted inline-block text-xs">
              Open in inventory ↗
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
