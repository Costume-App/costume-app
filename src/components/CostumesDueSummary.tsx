import Link from "next/link";
import { countdown } from "@/lib/countdown";

// Countdown to the costumes-due date + an outstanding roll-up. Server-renderable
// (no state). `total`/`made` come from the make worklist; `href` (optional) links
// the roll-up to the Tailor's summary.
export function CostumesDueSummary({
  dueDate,
  today,
  total,
  made,
  href,
}: {
  dueDate: string | null;
  today: string;
  total: number;
  made: number;
  href?: string;
}) {
  const outstanding = total - made;
  const cd = countdown(dueDate, today);

  let dueText: string | null = null;
  if (dueDate && cd.days !== null) {
    if (cd.days > 0) dueText = `Costumes due in ${cd.days} ${cd.days === 1 ? "day" : "days"}`;
    else if (cd.days === 0) dueText = "Costumes due today";
    else dueText = `Costumes ${-cd.days} ${-cd.days === 1 ? "day" : "days"} overdue`;
  }

  const rollup =
    total === 0
      ? null
      : outstanding === 0
        ? `All ${total} costumes made`
        : `${made} of ${total} made · ${outstanding} still to make`;

  if (!dueText && !rollup) return null;

  const toneColor =
    cd.tone === "past" ? "var(--red)" : cd.tone === "today" ? "var(--red)" : "var(--ink)";

  const rollupEl = rollup ? (
    href ? (
      <Link href={href} className="link-muted hover:underline">
        {rollup}
      </Link>
    ) : (
      <span className="muted">{rollup}</span>
    )
  ) : null;

  return (
    <div className="rounded-xl border border-[var(--field-line)] p-3 text-sm">
      {dueText && (
        <span className="font-medium" style={{ color: toneColor }}>
          {dueText}
        </span>
      )}
      {dueText && rollupEl && <span className="muted"> · </span>}
      {rollupEl}
    </div>
  );
}
