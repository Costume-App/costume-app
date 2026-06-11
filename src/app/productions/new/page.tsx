"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeShowings } from "@/lib/showings";

interface ShowingRow {
  date: string;
  time: string;
  label: string;
}

export default function NewProductionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showings, setShowings] = useState<ShowingRow[]>([{ date: "", time: "", label: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateShowing(index: number, patch: Partial<ShowingRow>) {
    setShowings((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addRow() {
    setShowings((prev) => [...prev, { date: "", time: "", label: "" }]);
  }

  function removeRow(index: number) {
    setShowings((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/productions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, showings: normalizeShowings(showings) }),
    });
    if (res.ok) {
      router.push("/productions");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Something went wrong");
    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="font-display mb-6 text-3xl font-semibold">New Production</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-medium">Show title</span>
          <input
            className="field w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mary Poppins"
            required
          />
        </label>

        <div className="space-y-2">
          <span className="mb-1 block font-medium">
            Showings <span className="muted font-normal">(Optional)</span>
          </span>
          {showings.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="field min-w-0 flex-1"
                value={s.date}
                onChange={(e) => updateShowing(i, { date: e.target.value })}
                aria-label="Showing date"
              />
              <input
                type="time"
                className="field w-32 shrink-0"
                value={s.time}
                onChange={(e) => updateShowing(i, { time: e.target.value })}
                aria-label="Showing time (optional)"
              />
              <input
                type="text"
                className="field min-w-0 flex-1"
                value={s.label}
                onChange={(e) => updateShowing(i, { label: e.target.value })}
                aria-label="Showing label (optional)"
                placeholder="Label (optional)"
              />
              <button type="button" onClick={() => removeRow(i)} className="link-muted text-sm">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="btn-ghost text-sm">
            Add date
          </button>
        </div>

        {error && <p className="text-[var(--red)]">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Create production"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/productions")}
            disabled={saving}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
