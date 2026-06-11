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

  // Without a `today` reference we can't pick a "next" — fall back to a plain
  // count header that toggles the full list.
  if (!next) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="lbl flex items-center gap-1">
          <span>{open ? "▾" : "▸"}</span>
          {countLabel}
        </button>
        {open && list}
      </div>
    );
  }

  // Next showing shows on its own line; the remaining showings collapse under a
  // "N other showing(s)" toggle.
  const others = showings.filter((s) => s.id !== next.id);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{showingText(next)}</span>
        <CountdownBadge showDate={next.show_date} today={today} />
      </div>
      {others.length > 0 && (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-sm muted hover:text-[var(--ink)]"
          >
            <span>{open ? "▾" : "▸"}</span>
            {others.length} other showing{others.length === 1 ? "" : "s"}
          </button>
          {open && (
            <ul className="space-y-0.5 pl-4">
              {others.map((s) => (
                <li key={s.id} className="text-sm muted">
                  {showingText(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
