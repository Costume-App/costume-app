"use client";

import { useRef, useState } from "react";

export function ProductionNotes({ productionId, notes }: { productionId: string; notes: string | null }) {
  const [open, setOpen] = useState(!!notes);
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(notes ?? "");

  async function save() {
    if (value === lastSaved.current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ notes: value }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save notes");
      setBusy(false);
      return;
    }
    lastSaved.current = value;
    setBusy(false);
    setSaved(true);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        ▸ Production notes
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(false)} className="link-muted text-sm">
          ▾ Production notes
        </button>
        {busy ? (
          <span className="text-xs muted">Saving…</span>
        ) : error ? (
          <span className="text-xs text-[var(--red)]">{error}</span>
        ) : saved ? (
          <span className="text-xs muted">Saved</span>
        ) : null}
      </div>
      <textarea
        className="field w-full"
        rows={4}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        placeholder="Notes for this production…"
      />
    </div>
  );
}
