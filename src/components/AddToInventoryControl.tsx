"use client";

import { useState } from "react";
import Link from "next/link";

// Shared control for adding a costume piece to House Inventory. Two modes:
// "button" (manual, flips to a link once added) and "prompt" (inline yes/no shown
// right after a piece is marked complete). Persistence is the server's; the parent
// supplies addedItemId and is told the new id via onAdded.
export function AddToInventoryControl({
  productionId,
  designId,
  castingId,
  pieceLabel,
  addedItemId,
  mode,
  onAdded,
  onDismiss,
}: {
  productionId: string;
  designId: string;
  castingId: string;
  pieceLabel: string;
  addedItemId: string | null;
  onAdded: (itemId: string) => void;
} & (
  // "prompt" must supply onDismiss (the "Not now" handler); "button" never does.
  | { mode: "button"; onDismiss?: never }
  | { mode: "prompt"; onDismiss: () => void }
)) {
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

  if (mode === "button") {
    if (addedItemId) {
      return (
        <Link href={`/inventory?item=${addedItemId}`} className="shrink-0 text-xs muted hover:text-[var(--red)] hover:underline">
          ✓ In House Inventory ↗
        </Link>
      );
    }
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={add} disabled={busy} className="text-xs text-[var(--red)] hover:underline disabled:opacity-50">
          {busy ? "Adding…" : "+ to House Inventory"}
        </button>
        {error && <span role="alert" className="text-xs text-[var(--red)]">{error}</span>}
      </div>
    );
  }

  // prompt mode
  if (addedItemId) return null;
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
