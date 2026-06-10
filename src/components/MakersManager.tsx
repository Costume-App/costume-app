"use client";

import { useState } from "react";
import { CAST_COLORS, DEFAULT_CAST_COLOR } from "@/lib/cast-colors";

interface MakerRow {
  id: string;
  name: string;
  color: string;
}

export function MakersManager({ initialMakers }: { initialMakers: MakerRow[] }) {
  const [makers, setMakers] = useState<MakerRow[]>(initialMakers);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CAST_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName, color: newColor }),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => [...prev, { id: maker.id, name: maker.name, color: maker.color }]);
      setNewName("");
      setNewColor(DEFAULT_CAST_COLOR);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add maker");
    }
    setBusy(false);
  }

  async function patch(id: string, body: { name?: string; color?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => prev.map((m) => (m.id === id ? { ...m, name: maker.name, color: maker.color } : m)));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save maker");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this maker? They'll be unassigned from any pieces.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setMakers((prev) => prev.filter((m) => m.id !== id));
    } else {
      setError("Couldn't remove maker");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {makers.length === 0 && <p className="text-sm muted">No makers yet. Add your costume team below.</p>}
      <ul className="space-y-2">
        {makers.map((m) => (
          <li key={m.id} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
            <input
              className="field min-w-0 flex-1"
              defaultValue={m.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && patch(m.id, { name: e.target.value })}
              aria-label="Maker name"
            />
            <Swatches value={m.color} onChange={(color) => patch(m.id, { color })} />
            <button type="button" onClick={() => remove(m.id)} disabled={busy} className="text-sm text-[var(--red)] hover:underline disabled:opacity-50">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
        <input
          className="field min-w-0 flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a maker (name)"
        />
        <Swatches value={newColor} onChange={setNewColor} />
        <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">
          Add maker
        </button>
      </form>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {CAST_COLORS.map((c) => (
        <button
          key={c.token}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.token}
          title={c.label}
          onClick={() => onChange(c.token)}
          className={`h-5 w-5 rounded-full border border-black/10 ${
            value === c.token ? "outline outline-2 outline-offset-1 outline-[var(--ink)]" : ""
          }`}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}
