"use client";

import { useEffect, useState } from "react";
import { MakersManager } from "@/components/MakersManager";

type MakerRow = { id: string; name: string; color: string };

export function MakersTabIcon() {
  // Small scissors glyph for the custom profile-page label.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function OrgMakersPanel() {
  const [makers, setMakers] = useState<MakerRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/makers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { makers?: MakerRow[] }) => {
        if (active) setMakers((d.makers ?? []).map((m) => ({ id: m.id, name: m.name, color: m.color })));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-[var(--red)]">Couldn&apos;t load makers.</p>;
  if (!makers) return <p className="text-sm muted">Loading makers…</p>;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold">Makers</h2>
      <p className="mt-1 mb-4 text-sm muted">
        Your costume team. Assign them to pieces to make, and track who&apos;s done.
      </p>
      <MakersManager initialMakers={makers} />
    </div>
  );
}
