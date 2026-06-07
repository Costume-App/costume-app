import { nextUpcomingDate, latestDate } from "@/lib/countdown";

export type ProductionStatus = "active" | "past" | "inactive";

// Effective status from the manual flag + show dates, relative to `today`.
export function classifyProduction(isActive: boolean, dates: string[], today: string): ProductionStatus {
  if (!isActive) return "inactive";
  const last = latestDate(dates);
  if (last !== null && last < today) return "past";
  return "active";
}

interface ProductionWithDates {
  id: string;
  is_active: boolean;
  created_at: string;
  dates: string[];
}

// Newest-created first (used as a tiebreaker and for undated items).
function compareCreatedDesc(a: ProductionWithDates, b: ProductionWithDates): number {
  return a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0;
}

// Active order: soonest upcoming date first; undated last; tiebreak newest-created.
function compareByNextUpcoming(a: ProductionWithDates, b: ProductionWithDates, today: string): number {
  const an = nextUpcomingDate(a.dates, today);
  const bn = nextUpcomingDate(b.dates, today);
  if (an && bn) return an < bn ? -1 : an > bn ? 1 : compareCreatedDesc(a, b);
  if (an) return -1;
  if (bn) return 1;
  return compareCreatedDesc(a, b);
}

// Past/Inactive order: most-recent date first; undated last; tiebreak newest-created.
function compareByLatest(a: ProductionWithDates, b: ProductionWithDates): number {
  const al = latestDate(a.dates);
  const bl = latestDate(b.dates);
  if (al && bl) return al > bl ? -1 : al < bl ? 1 : compareCreatedDesc(a, b);
  if (al) return -1;
  if (bl) return 1;
  return compareCreatedDesc(a, b);
}

// Split into the Active bucket and the combined "Past and Inactives" bucket, each sorted.
export function partitionProductions<T extends ProductionWithDates>(
  productions: T[],
  today: string,
): { active: T[]; inactive: T[] } {
  const active: T[] = [];
  const inactive: T[] = [];
  for (const p of productions) {
    if (classifyProduction(p.is_active, p.dates, today) === "active") active.push(p);
    else inactive.push(p);
  }
  active.sort((a, b) => compareByNextUpcoming(a, b, today));
  inactive.sort(compareByLatest);
  return { active, inactive };
}
