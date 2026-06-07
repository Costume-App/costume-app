"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";

interface Row {
  id: string;
  title: string;
  displayDate: string | null;
}

export function PastAndInactiveProductions({ productions }: { productions: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (productions.length === 0) return null;

  async function makeActive(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/productions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't reactivate");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted mt-6 text-sm">
        Show past &amp; inactive ({productions.length})
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="lbl">Past and Inactives</span>
        <button type="button" onClick={() => setOpen(false)} className="link-muted text-sm">
          Hide
        </button>
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <ul className="space-y-3">
        {productions.map((p) => (
          <li key={p.id} className="surface">
            <div className="flex items-center justify-between gap-3 p-4">
              <Link href={`/productions/${p.id}`} className="font-display text-xl font-semibold">
                {p.title}
              </Link>
              <div className="flex items-center gap-2">
                {p.displayDate && <span className="text-sm muted">{formatShowDate(p.displayDate)}</span>}
                <CountdownBadge showDate={p.displayDate} />
                <button
                  type="button"
                  onClick={() => makeActive(p.id)}
                  disabled={busyId === p.id}
                  className="link-red text-sm"
                >
                  {busyId === p.id ? "…" : "Make active"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
