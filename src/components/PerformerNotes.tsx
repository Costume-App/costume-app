"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Free-text notes for one performer (fit notes, leftovers from an imported measurement form).
// Saves on blur; grows to fit its content like ProductionNotes.
export function PerformerNotes({ performerId, notes }: { performerId: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(notes ?? "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);

  async function save() {
    if (value === lastSaved.current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/performers/${performerId}`, {
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
    const { performer } = (await res.json()) as { performer: { notes: string | null } };
    const trimmed = performer.notes ?? "";
    lastSaved.current = trimmed;
    setValue(trimmed);
    setBusy(false);
    setSaved(true);
  }

  return (
    <section className="mt-8 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Notes</h2>
        {busy ? (
          <span className="text-xs muted">Saving…</span>
        ) : error ? (
          <span className="text-xs text-[var(--red)]">{error}</span>
        ) : saved ? (
          <span className="text-xs text-[var(--green)]">Saved ✓</span>
        ) : null}
      </div>
      <textarea
        ref={taRef}
        className="field w-full"
        rows={3}
        style={{ minHeight: "5rem", overflow: "hidden", resize: "none" }}
        value={value}
        placeholder="Fit notes, anything from a paper form that has no field here"
        aria-label="Performer notes"
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        disabled={busy}
      />
    </section>
  );
}
