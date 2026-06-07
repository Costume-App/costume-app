"use client";

import { useState } from "react";
import Link from "next/link";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";

interface Row {
  id: string;
  title: string;
  displayDate: string | null;
}

export function PastAndInactiveProductions({ productions }: { productions: Row[] }) {
  const [open, setOpen] = useState(false);

  if (productions.length === 0) return null;

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
      <ul className="space-y-3">
        {productions.map((p) => (
          <li key={p.id} className="surface transition-transform hover:-translate-y-0.5">
            <Link href={`/productions/${p.id}`} className="block p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-xl font-semibold">{p.title}</span>
                <div className="flex items-center gap-2">
                  {p.displayDate && <span className="text-sm muted">{formatShowDate(p.displayDate)}</span>}
                  <CountdownBadge showDate={p.displayDate} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
