"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Performer {
  id: string;
  label: string;
}

export function PerformerList({
  productionId,
  initialPerformers,
}: {
  productionId: string;
  initialPerformers: Performer[];
}) {
  const router = useRouter();
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPerformer(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/performers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const { performer } = (await res.json()) as { performer: Performer };
      setPerformers((prev) => [...prev, performer]);
      setLabel("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Couldn't add performer");
    }
    setBusy(false);
  }

  async function removePerformer(id: string) {
    setBusy(true);
    const res = await fetch(`/api/performers/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setPerformers((prev) => prev.filter((p) => p.id !== id));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {performers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
          No cast members yet. Add your first performer below.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {performers.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <Link
                href={`/productions/${productionId}/performers/${p.id}`}
                className="font-medium hover:underline"
              >
                {p.label}
              </Link>
              <button
                onClick={() => removePerformer(p.id)}
                disabled={busy}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addPerformer} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Performer name or role"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
      <button onClick={() => router.refresh()} className="text-sm text-gray-400 hover:underline">
        Refresh
      </button>
    </div>
  );
}
