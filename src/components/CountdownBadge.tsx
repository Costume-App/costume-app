import { countdown, todayIso } from "@/lib/countdown";

const toneClass: Record<string, string> = {
  future: "bg-[var(--red)] text-[var(--red-fg)]",
  today: "bg-[var(--ink)] text-[var(--red-fg)]",
  past: "border border-[var(--field-line)] text-[var(--muted)]",
  none: "border border-[var(--field-line)] text-[var(--muted)]",
};

export function CountdownBadge({ showDate, today }: { showDate: string | null; today?: string }) {
  const c = countdown(showDate, today ?? todayIso());
  return (
    <span className={`inline-block rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[c.tone]}`}>
      {c.label}
    </span>
  );
}
