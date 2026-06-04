import { countdown, todayIso } from "@/lib/countdown";

const toneClass: Record<string, string> = {
  future: "bg-emerald-100 text-emerald-800",
  today: "bg-amber-100 text-amber-900",
  past: "bg-gray-100 text-gray-500",
  none: "bg-gray-100 text-gray-400",
};

export function CountdownBadge({ showDate }: { showDate: string | null }) {
  const c = countdown(showDate, todayIso());
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${toneClass[c.tone]}`}>
      {c.label}
    </span>
  );
}
