"use client";

// One collapsible role card. Collapsed = a single summary line; expanded shows children.
// Controlled: the owner holds `open` (so it can be persisted) and toggles via `onToggle`.
// `tint`/`edge` style the card with the active cast's color.
export function CollapsibleRole({
  title,
  summary,
  open,
  onToggle,
  tint,
  edge,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  tint: string;
  edge: string;
  children: React.ReactNode;
}) {
  return (
    <li className="surface p-0" style={{ backgroundColor: tint, borderColor: edge }}>
      <button
        type="button"
        onClick={onToggle}
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
