# List All Showings on Production Cards — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Builds on:** showing times + edit showings, merged.

## Problem

Production cards on `/productions` show only a single date (the next upcoming, or a fallback). With multiple showings per production, users want to see the **full run** — every date and time — at a glance.

## Goal

Each production card lists all its showings (date + time). Active cards keep the countdown badge for the next showing; Past and Inactives rows show the showings list with **no** badge.

## Components / changes

### New `src/components/ShowingsList.tsx` (presentational, server + client safe)

A small component (no `"use client"`, no hooks) so both the server list/detail pages and the client `PastAndInactiveProductions` can use it:

```tsx
import { formatShowDate, formatShowTime } from "@/lib/countdown";

interface Showing {
  id: string;
  show_date: string;
  show_time: string | null;
}

export function ShowingsList({ showings }: { showings: Showing[] }) {
  if (showings.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {showings.map((s) => (
        <li key={s.id} className="text-sm muted">
          {formatShowDate(s.show_date)}
          {s.show_time ? ` · ${formatShowTime(s.show_time)}` : ""}
        </li>
      ))}
    </ul>
  );
}
```

### List page `src/app/productions/page.tsx`

- Build each production's showings from the already-fetched `allShowDates` (sorted by date then time). `withDates` gains `showings`:
  ```tsx
  const withDates = productions.map((p) => {
    const showings = allShowDates.filter((d) => d.production_id === p.id);
    return { ...p, dates: showings.map((s) => s.show_date), showings };
  });
  ```
  (`partitionProductions` only reads `id`/`is_active`/`created_at`/`dates`; the extra `showings` field is harmless.)
- **Active cards:** title + `<CountdownBadge showDate={nextUpcomingDate(p.dates, today)} />` on the top row, then `<ShowingsList showings={p.showings} />` below (with a `mt-2` wrapper). Remove the single date `<span>` that sat next to the badge.
- **Past and Inactives:** build rows as `{ id, title, showings }` (no `displayDate`) and pass to `PastAndInactiveProductions`.

### `src/components/PastAndInactiveProductions.tsx`

- `Row` becomes `{ id: string; title: string; showings: { id; show_date; show_time }[] }` — drop `displayDate`.
- Each row: the title `Link` + `<ShowingsList showings={p.showings} />`. **No** `CountdownBadge`, no date span.
- Remove the now-unused `CountdownBadge` and `formatShowDate` imports; add `ShowingsList`. The collapse toggle, "Make active" removal (already gone), and `lbl`/"Hide" header are unchanged.

### Detail page `src/app/productions/[id]/page.tsx` (DRY cleanup)

- Replace the inline `<ul>` Showings list with `<ShowingsList showings={showDates} />` (the `ShowDate[]` rows already match the `Showing` shape). Drop the now-unused `formatShowDate`/`formatShowTime` imports **only if** they're no longer referenced elsewhere in the file — the header still uses both for the next-showing line, so keep them.

## Error handling

None new — pure display. Empty showings → `ShowingsList` renders nothing.

## Testing

`ShowingsList` is pure presentation (no branching logic beyond the empty guard) → no new unit tests, consistent with the codebase. Existing 158 tests stay green (`tsc`/`lint` clean). Manual smoke: a multi-showing production shows all dates+times on its card in both sections; active keeps the badge, past/inactive has none.

## Migration / demo dependency

None.
