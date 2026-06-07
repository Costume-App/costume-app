export type CountdownTone = "future" | "today" | "past" | "none";

export interface Countdown {
  days: number | null;
  label: string;
  tone: CountdownTone;
}

// Parse a YYYY-MM-DD string into a UTC-midnight epoch day count (no timezone drift).
function toEpochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function countdown(showDate: string | null, today: string): Countdown {
  if (!showDate) {
    return { days: null, label: "No date set", tone: "none" };
  }
  const days = toEpochDay(showDate) - toEpochDay(today);
  if (days === 0) {
    return { days: 0, label: "Opens today!", tone: "today" };
  }
  if (days > 0) {
    const unit = days === 1 ? "day" : "days";
    return { days, label: `${days} ${unit} to go`, tone: "future" };
  }
  const ago = -days;
  const unit = ago === 1 ? "day" : "days";
  return { days, label: `Opened ${ago} ${unit} ago`, tone: "past" };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Render a YYYY-MM-DD date as e.g. "Jul 16, 2026" (date-only, no timezone drift).
export function formatShowDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// Today's date as YYYY-MM-DD in the user's local timezone.
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Soonest date on or after `today`, or null if none upcoming. Dates are YYYY-MM-DD,
// so lexical comparison/sort is correct.
export function nextUpcomingDate(dates: string[], today: string): string | null {
  const upcoming = dates.filter((d) => d >= today).sort();
  return upcoming[0] ?? null;
}

// Latest date, or null if the list is empty.
export function latestDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort()[dates.length - 1];
}
