"use client";

import { useState } from "react";
import { formatShowDate, formatShowTime } from "@/lib/countdown";

interface Showing {
  id: string;
  show_date: string;
  show_time: string | null;
}

// Read-only list of a production's showings (date + optional time) under a
// pluralized count header. With `collapsible`, the header toggles the list
// (collapsed by default). Pure presentation otherwise.
export function ShowingsList({
  showings,
  collapsible = false,
}: {
  showings: Showing[];
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (showings.length === 0) return null;

  const label = `${showings.length} ${showings.length === 1 ? "Showing" : "Showings"}`;
  const list = (
    <ul className="space-y-0.5">
      {showings.map((s) => (
        <li key={s.id} className="text-sm muted">
          {formatShowDate(s.show_date)}
          {s.show_time ? ` · ${formatShowTime(s.show_time)}` : ""}
        </li>
      ))}
    </ul>
  );

  if (!collapsible) {
    return (
      <div className="space-y-1">
        <span className="lbl block">{label}</span>
        {list}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="lbl flex items-center gap-1">
        <span>{open ? "▾" : "▸"}</span>
        {label}
      </button>
      {open && list}
    </div>
  );
}
