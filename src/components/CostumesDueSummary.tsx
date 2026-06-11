import Link from "next/link";
import { countdown } from "@/lib/countdown";
import { countdownBadgeClass } from "@/components/CountdownBadge";

// Costumes-due countdown + outstanding roll-up. When `href` is given the whole
// card links there (the Tailor's summary) and shows a link affordance; without
// `href` it's a plain card (rendered only when it has something to say).
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

  // Nothing to show and nowhere to link → render nothing.
  if (!href && !dueText && !rollup) return null;

  const body = (
    <>
      {dueText && (
        <p>
          <span className={countdownBadgeClass(cd.tone)}>{dueText}</span>
        </p>
      )}
      {rollup && <p className={`muted ${dueText ? "mt-1.5" : ""}`}>{rollup}</p>}
      {href && (
        <p className={`link-muted text-sm ${dueText || rollup ? "mt-1.5" : ""}`}>
          Tailor&apos;s summary →
        </p>
      )}
    </>
  );

  const cardClass = "block rounded-xl border border-[var(--field-line)] p-3 text-sm";

  if (href) {
    return (
      <Link href={href} className={`${cardClass} transition-colors hover:border-[var(--red)]`}>
        {body}
      </Link>
    );
  }
  return <div className={cardClass}>{body}</div>;
}
