"use client";

import { useState } from "react";
import type { MakerAssignment } from "@/lib/maker-assignments";

export function MyWorkList({ initial }: { initial: MakerAssignment[] }) {
  const [rows, setRows] = useState<MakerAssignment[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(pieceId: string, made: boolean) {
    setBusy(pieceId);
    setRows((prev) => prev.map((r) => (r.pieceId === pieceId ? { ...r, made } : r)));
    const res = await fetch(`/api/pieces/${pieceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ made }),
    }).catch(() => null);
    if (!res || !res.ok) setRows((prev) => prev.map((r) => (r.pieceId === pieceId ? { ...r, made: !made } : r)));
    setBusy(null);
  }

  if (rows.length === 0) return <p className="text-sm muted">Nothing assigned to you yet.</p>;

  // Group by production (rows are already sorted by production then role).
  const groups: { title: string; rows: MakerAssignment[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.title === r.productionTitle) last.rows.push(r);
    else groups.push({ title: r.productionTitle, rows: [r] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <div className="border-b border-[var(--field-line)] pb-1.5">
            <span className="lbl">{g.title}</span>
          </div>
          <ul className="space-y-1.5">
            {g.rows.map((r) => (
              <li key={r.pieceId} className="surface !shadow-none flex items-center gap-3 p-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={r.made}
                  disabled={busy === r.pieceId}
                  onChange={(e) => toggle(r.pieceId, e.target.checked)}
                  aria-label={`Mark ${r.designName} done`}
                />
                <span className={`min-w-0 flex-1 truncate ${r.made ? "line-through muted" : ""}`}>
                  {r.roleName} → {r.performerName} — {r.designName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
