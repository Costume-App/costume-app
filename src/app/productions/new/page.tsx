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
      <h1 className="mb-6 text-2xl font-bold">New Production</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-medium">Show title</span>
          <input
            className="w-full rounded-lg border p-3"
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
            className="w-full rounded-lg border p-3"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
          />
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create production"}
        </button>
      </form>
    </main>
  );
}
