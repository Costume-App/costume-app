"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProductionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showDate, setShowDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/productions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, showDate: showDate || null }),
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
        <label className="block">
          <span className="mb-1 block font-medium">Show date</span>
          <input
            type="date"
            className="field w-full"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
          />
        </label>
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
