"use client";

import { useState } from "react";

// Inline prompt to add a costume piece to House Inventory, shown right after a
// piece is marked complete (made/purchased). Persistence is the server's; the
// parent decides when to show this and is told the new item id via onAdded.
export function AddToInventoryControl({
  productionId,
  designId,
  castingId,
  pieceLabel,
  onAdded,
  onDismiss,
}: {
  productionId: string;
  designId: string;
  castingId: string;
  pieceLabel: string;
  onAdded: (itemId: string) => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/pieces/to-inventory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ designId, castingId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { addedInventoryItemId: string };
        onAdded(data.addedInventoryItemId);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add to inventory");
      }
    } catch {
      setError("Couldn't add to inventory");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-[var(--field-line)] bg-[var(--bg)] px-2 py-1.5 text-sm">
      <span>Add <strong>{pieceLabel}</strong> to House Inventory?</span>
      <button type="button" onClick={add} disabled={busy} className="btn-primary !px-2 !py-0.5 text-xs">
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        disabled={busy}
        aria-label={`Dismiss — don't add ${pieceLabel} to House Inventory`}
        className="link-muted text-xs"
      >
        Not now
      </button>
      {error && <span role="alert" className="text-xs text-[var(--red)]">{error}</span>}
    </div>
  );
}
