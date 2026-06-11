"use client";

import { useState } from "react";
import { formatShowDate, formatShowTime } from "@/lib/countdown";
import { CountdownBadge } from "@/components/CountdownBadge";

interface Showing {
  id: string;
  show_date: string;
  show_time: string | null;
  label?: string | null;
}

// Render one showing line: date · time · label (each optional part omitted when absent).
function showingText(s: Showing): string {
  return (
    formatShowDate(s.show_date) +
    (s.show_time ? ` · ${formatShowTime(s.show_time)}` : "") +
    (s.label ? ` · ${s.label}` : "")
  );
}

// A production's showings (date · optional time · optional label) under a count
// header. With `collapsible`, the header is collapsed by default and — when
// `today` is provided — summarizes the next showing + its countdown, expanding
// to the full list. Pure presentation otherwise.
export function ShowingsList({
  showings,
  collapsible = false,
  today,
}: {
  showings: Showing[];
  collapsible?: boolean;
  today?: string;
}) {
  const [open, setOpen] = useState(false);

  if (showings.length === 0) return null;

  const countLabel = `${showings.length} ${showings.length === 1 ? "Showing" : "Showings"}`;
  const list = (
    <ul className="space-y-0.5">
      {showings.map((s) => (
        <li key={s.id} className="text-sm muted">
          {showingText(s)}
        </li>
      ))}
    </ul>
  );

  if (!collapsible) {
    return (
      <div className="space-y-1">
        <span className="lbl block">{countLabel}</span>
        {list}
      </div>
    );
  }

  // showings arrive sorted by date then time. The next showing is the first one
  // dated today-or-later; for a past production, fall back to the last showing.
  const next = today
    ? showings.find((s) => s.show_date >= today) ?? showings[showings.length - 1]
    : null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        {next ? (
          <>
            <span className="text-sm">{showingText(next)}</span>
            <CountdownBadge showDate={next.show_date} today={today} />
            {showings.length > 1 && (
              <span className="ml-auto text-xs muted">{showings.length} showings</span>
            )}
          </>
        ) : (
          <span className="lbl">{countLabel}</span>
        )}
      </button>
      {open && list}
    </div>
  );
}
