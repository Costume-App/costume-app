"use client";

import { useState } from "react";

// Inline two-step prompt to add a costume piece to House Inventory, shown right
// after a piece is marked complete (made/purchased). Step 1 asks; step 2 collects
// optional category / location / size — everything else (name, notes, quantity,
// photos) comes from the piece. The parent decides when to show this and is told
// the new item id via onAdded.
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
  const [step, setStep] = useState<"ask" | "details">("ask");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [size, setSize] = useState("");
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
        body: JSON.stringify({ designId, castingId, category, location, size }),
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
    <div className="mt-1 rounded-md border border-[var(--field-line)] bg-[var(--bg)] px-2 py-1.5 text-sm">
      {step === "ask" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Add <strong>{pieceLabel}</strong> to House Inventory?</span>
          <button type="button" onClick={() => setStep("details")} className="btn-primary !px-2 !py-0.5 text-xs">
            Add
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss — don't add ${pieceLabel} to House Inventory`}
            className="link-muted text-xs"
          >
            Not now
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <span className="lbl block">Add {pieceLabel} — optional details</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <input className="field !p-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
            <input className="field !p-1.5 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" />
            <input className="field !p-1.5 text-sm" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" aria-label="Size" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={add} disabled={busy} className="btn-primary !px-2 !py-0.5 text-xs">
              {busy ? "Adding…" : "Add to House Inventory"}
            </button>
            <button type="button" onClick={onDismiss} disabled={busy} className="link-muted text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
