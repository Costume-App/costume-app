"use client";

import { useState } from "react";

// One collapsible role card. Collapsed = a single summary line; expanded shows children.
// `tint`/`edge` style the card with the active cast's color.
export function CollapsibleRole({
  title,
  summary,
  defaultOpen = false,
  tint,
  edge,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  tint: string;
  edge: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="surface p-0" style={{ backgroundColor: tint, borderColor: edge }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        <span className="font-display text-lg font-semibold">{title}</span>
        {!open && summary != null && <span className="ml-auto text-xs muted">{summary}</span>}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </li>
  );
}
