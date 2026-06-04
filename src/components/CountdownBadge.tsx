import { countdown, todayIso } from "@/lib/countdown";

const toneClass: Record<string, string> = {
  future: "bg-[var(--red)] text-[var(--red-fg)]",
  today: "bg-[var(--ink)] text-[var(--red-fg)]",
  past: "border border-[var(--field-line)] text-[var(--muted)]",
  none: "border border-[var(--field-line)] text-[var(--muted)]",
};

export function CountdownBadge({ showDate }: { showDate: string | null }) {
  const c = countdown(showDate, todayIso());
  return (
    <span className={`inline-block rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[c.tone]}`}>
      {c.label}
    </span>
  );
}
