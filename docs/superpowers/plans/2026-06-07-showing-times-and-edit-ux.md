# Showing Times + Edit UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional times to showings (matinees), show weekday + time, and make clicking the production name open the edit dialog.

**Architecture:** Add a nullable `show_time` column to `show_dates` (one row per showing; same date may repeat). Extend the date helpers (`formatShowDate` weekday prefix, new `formatShowTime`), thread `show_time` through the data layer / API / edit dialog, and render the next showing + a read-only Showings list on the detail page. Active/inactive classification stays date-level (unchanged).

**Tech Stack:** Next.js 16, TypeScript strict, Supabase, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-showing-times-and-edit-ux-design.md`

**Conventions:** data fns throw `ValidationError`; routes do `getAuthContext` → `assertProductionInOrg` → data → JSON via `errorResponse`. Supabase returns a `time` column as `"HH:MM:SS"`; `<input type="time">` yields `"HH:MM"`.

---

## Task 1: Migration `0008_show_times.sql`

**Files:**
- Create: `supabase/migrations/0008_show_times.sql`

- [ ] **Step 1: Create the file**

```sql
-- Optional time-of-day per showing (matinee + evening = two rows, same date).
alter table show_dates add column show_time time;
```

- [ ] **Step 2: Commit (Chris applies it in Supabase; do NOT apply here)**

```bash
git add supabase/migrations/0008_show_times.sql
git commit -m "feat: 0008 show_dates.show_time column"
```

> **MANUAL STEP (Chris):** apply in the Supabase SQL editor before exercising times. Existing showings keep `null` time. Tests use mocks and don't need the DB.

---

## Task 2: Date/time helpers in `countdown.ts`

**Files:**
- Modify: `src/lib/countdown.ts`
- Modify: `src/lib/countdown.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/lib/countdown.test.ts`:

1. Change the import line to include `formatShowTime`:

```typescript
import { countdown, todayIso, formatShowDate, formatShowTime } from "@/lib/countdown";
```

2. Replace the existing `formatShowDate` test with the weekday-prefixed expectations:

```typescript
test("formatShowDate renders weekday + human-readable date with no timezone drift", () => {
  expect(formatShowDate("2026-07-16")).toBe("Thu, Jul 16, 2026");
  expect(formatShowDate("2026-01-01")).toBe("Thu, Jan 1, 2026");
  expect(formatShowDate("2026-12-31")).toBe("Thu, Dec 31, 2026");
  expect(formatShowDate("2026-06-13")).toBe("Sat, Jun 13, 2026");
});
```

3. Add a `formatShowTime` test right after it:

```typescript
test("formatShowTime renders 12-hour times and handles seconds + empty", () => {
  expect(formatShowTime("14:00")).toBe("2:00 PM");
  expect(formatShowTime("09:30")).toBe("9:30 AM");
  expect(formatShowTime("00:00")).toBe("12:00 AM");
  expect(formatShowTime("12:00")).toBe("12:00 PM");
  expect(formatShowTime("14:00:00")).toBe("2:00 PM");
  expect(formatShowTime("")).toBe("");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- countdown`
Expected: FAIL — `formatShowTime` is not exported and `formatShowDate` returns the old format.

- [ ] **Step 3: Update `src/lib/countdown.ts`**

1. Add a `DAYS` array next to `MONTHS`:

```typescript
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
```

2. Replace `formatShowDate` with the weekday-prefixed version:

```typescript
// Render a YYYY-MM-DD date as e.g. "Sat, Jun 13, 2026" (date-only, no timezone drift).
export function formatShowDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}
```

3. Add `formatShowTime` after `formatShowDate`:

```typescript
// Render an "HH:MM" or "HH:MM:SS" time as e.g. "2:00 PM"; "" for empty/invalid.
export function formatShowTime(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) return "";
  const h = Number(parts[0]);
  const minutes = parts[1];
  if (Number.isNaN(h)) return "";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${minutes} ${period}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- countdown`
Expected: PASS (all countdown tests, including updated formatShowDate + new formatShowTime).

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/lib/countdown.test.ts
git commit -m "feat: weekday in formatShowDate + formatShowTime helper"
```

---

## Task 3: `show-dates` data layer — `show_time`

**Files:**
- Modify: `src/lib/data/show-dates.ts`
- Modify: `src/lib/data/show-dates.test.ts`

- [ ] **Step 1: Update the tests first**

In `src/lib/data/show-dates.test.ts`:

1. The `listShowDates` query now chains a second `.order(...)`. Update the mock so the first `order` returns an object with another `order`. Replace the mock-declaration block (top of file) lines for `order` with two order mocks:

Change:
```typescript
const order = vi.fn();
const inFn = vi.fn(() => ({ order }));
```
to:
```typescript
const order2 = vi.fn();
const order1 = vi.fn(() => ({ order: order2 }));
const inFn = vi.fn(() => ({ order: order1 }));
```

2. In `beforeEach`, update the reset array and re-wiring. Change:
```typescript
  [order, inFn, selectList, single, insertSelect, insert, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  inFn.mockReturnValue({ order });
```
to:
```typescript
  [order2, order1, inFn, selectList, single, insertSelect, insert, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  order1.mockReturnValue({ order: order2 });
  inFn.mockReturnValue({ order: order1 });
```

3. Replace the "listShowDates queries..." test with:
```typescript
test("listShowDates queries show_dates by production_id, ordered by date then time", async () => {
  order2.mockResolvedValue({
    data: [{ id: "s1", production_id: "p1", show_date: "2026-07-01", show_time: "14:00:00" }],
    error: null,
  });
  const rows = await listShowDates(["p1", "p2"]);
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(inFn).toHaveBeenCalledWith("production_id", ["p1", "p2"]);
  expect(order1).toHaveBeenCalledWith("show_date", { ascending: true });
  expect(order2).toHaveBeenCalledWith("show_time", { ascending: true, nullsFirst: false });
  expect(rows).toEqual([{ id: "s1", production_id: "p1", show_date: "2026-07-01", show_time: "14:00:00" }]);
});
```

4. Replace the "addShowDate inserts..." test with two tests (with-time and null-time):
```typescript
test("addShowDate inserts date + time and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "s2", production_id: "p1", show_date: "2026-08-01", show_time: "14:00:00" }, error: null });
  const row = await addShowDate("p1", "2026-08-01", "14:00");
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-01", show_time: "14:00" });
  expect(row).toEqual({ id: "s2", production_id: "p1", show_date: "2026-08-01", show_time: "14:00:00" });
});

test("addShowDate stores null time when none given", async () => {
  single.mockResolvedValue({ data: { id: "s3", production_id: "p1", show_date: "2026-08-02", show_time: null }, error: null });
  await addShowDate("p1", "2026-08-02", null);
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", show_date: "2026-08-02", show_time: null });
});
```

5. The "addShowDate rejects an empty date" test now passes a time arg — change its call to:
```typescript
  await expect(addShowDate("p1", "  ", null)).rejects.toBeInstanceOf(ValidationError);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- show-dates`
Expected: FAIL (signature/order mismatch).

- [ ] **Step 3: Update `src/lib/data/show-dates.ts`**

1. Add `show_time` to the interface:
```typescript
export interface ShowDate {
  id: string;
  production_id: string;
  show_date: string;
  show_time: string | null;
  created_at: string;
}
```

2. Add the second order to `listShowDates`:
```typescript
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .select("*")
    .in("production_id", productionIds)
    .order("show_date", { ascending: true })
    .order("show_time", { ascending: true, nullsFirst: false });
```

3. Replace `addShowDate` with the time-aware version:
```typescript
export async function addShowDate(productionId: string, date: string, time: string | null): Promise<ShowDate> {
  const show_date = date.trim();
  if (!show_date) throw new ValidationError("Show date is required");
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .insert({ production_id: productionId, show_date, show_time: time || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShowDate;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- show-dates`
Expected: PASS (data tests). NOTE: tsc will now flag `addShowDate` callers passing 2 args (route + productions route) — fixed in Tasks 4 & 5. Report tsc errors with files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/show-dates.ts src/lib/data/show-dates.test.ts
git commit -m "feat: show_time on show-dates data layer"
```

---

## Task 4: `POST /api/productions/[id]/show-dates` — accept time

**Files:**
- Modify: `src/app/api/productions/[id]/show-dates/route.ts`
- Modify: `src/app/api/productions/[id]/show-dates/route.test.ts`

- [ ] **Step 1: Update the route**

In `src/app/api/productions/[id]/show-dates/route.ts`, replace the body parse + `addShowDate` call:

```typescript
    const body = (await request.json()) as { date?: string; time?: string };
    const showDate = await addShowDate(
      id,
      typeof body.date === "string" ? body.date : "",
      typeof body.time === "string" ? body.time : null,
    );
```

- [ ] **Step 2: Update the tests**

In `src/app/api/productions/[id]/show-dates/route.test.ts`:

1. The "POST adds a show date (201)" test — pass a time and assert it forwards. Replace the test body's call + assertion:
```typescript
test("POST adds a show date with time (201)", async () => {
  addShowDate.mockResolvedValue({ id: "s1", production_id: "p1", show_date: "2026-08-01", show_time: "14:00:00" });
  const res = await POST(req({ date: "2026-08-01", time: "14:00" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledWith("p1", "2026-08-01", "14:00");
});

test("POST defaults time to null when omitted", async () => {
  addShowDate.mockResolvedValue({ id: "s4", production_id: "p1", show_date: "2026-08-02", show_time: null });
  const res = await POST(req({ date: "2026-08-02" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledWith("p1", "2026-08-02", null);
});
```

2. The "POST 400 on an empty date" and "POST 404..." tests still pass `req({ date: ... })`; leave them — `addShowDate` is mocked so the missing time arg in the assertion is fine (the 404 test asserts `not.toHaveBeenCalled`).

- [ ] **Step 3: Run + tsc**

Run: `npm test -- show-dates` then `npx tsc --noEmit`
Expected: route tests pass; remaining tsc error only in `src/app/api/productions/route.ts` (Task 5). Report.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/show-dates/route.ts" "src/app/api/productions/[id]/show-dates/route.test.ts"
git commit -m "feat: show-dates POST accepts an optional time"
```

---

## Task 5: `POST /api/productions` — pass null time

**Files:**
- Modify: `src/app/api/productions/route.ts`
- Modify: `src/app/api/productions/route.test.ts`

- [ ] **Step 1: Update the call**

In `src/app/api/productions/route.ts`, change the `addShowDate` call (currently `await addShowDate(production.id, body.showDate);`) to:

```typescript
      await addShowDate(production.id, body.showDate, null);
```

- [ ] **Step 2: Update the test assertion**

In `src/app/api/productions/route.test.ts`, change the assertion `expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01");` to:

```typescript
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null);
```

- [ ] **Step 3: Run + tsc**

Run: `npm test` then `npx tsc --noEmit`
Expected: all tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/productions/route.ts src/app/api/productions/route.test.ts
git commit -m "feat: first show date created with null time"
```

---

## Task 6: Edit dialog — title opens edit, time input, time display

**Files:**
- Modify: `src/components/EditableProductionHeader.tsx`

- [ ] **Step 1: Add `show_time` to the item type, a time state, and `formatShowTime` import**

1. Change the import:
```typescript
import { formatShowDate, formatShowTime, latestDate, todayIso } from "@/lib/countdown";
```

2. Extend `ShowDateItem`:
```typescript
interface ShowDateItem {
  id: string;
  show_date: string;
  show_time: string | null;
}
```

3. Add a `newTime` state next to `newDate`:
```typescript
  const [newTime, setNewTime] = useState("");
```

- [ ] **Step 2: Update `addDate` (send time + relaxed duplicate guard)**

Replace the `addDate` function with:
```typescript
  async function addDate() {
    if (!newDate) return;
    const dup = showDates.some(
      (d) => d.show_date === newDate && (d.show_time ?? "").slice(0, 5) === newTime,
    );
    if (dup) {
      setError("That showing is already added.");
      return;
    }
    const ok = await send(
      `/api/productions/${productionId}/show-dates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: newDate, time: newTime }),
      },
      "Couldn't add showing",
    );
    if (ok) {
      setNewDate("");
      setNewTime("");
    }
  }
```

- [ ] **Step 3: Make the title open edit (collapsed view)**

Replace the `if (!editing) { return (...) }` block with a clickable title (no separate Edit link):
```typescript
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block text-left"
        title="Edit production"
      >
        <h1 className="font-display text-3xl font-semibold leading-none hover:text-[var(--red)]">
          {title}
        </h1>
      </button>
    );
  }
```

- [ ] **Step 4: Show the time on each showing row + add the time input**

Replace the show-dates list `<div>` (the block starting `<div className="space-y-2">` through its closing `</div>`) with:
```typescript
      <div className="space-y-2">
        <span className="lbl block">Showings</span>
        {showDates.length === 0 && <p className="text-sm muted">No showings yet.</p>}
        {showDates.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {formatShowDate(d.show_date)}
              {d.show_time ? ` · ${formatShowTime(d.show_time)}` : ""}
            </span>
            <button type="button" onClick={() => removeDate(d.id)} disabled={busy} className="link-muted text-sm">
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="field flex-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <input
            type="time"
            className="field"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            aria-label="Showing time (optional)"
          />
          <button type="button" onClick={addDate} disabled={busy || !newDate} className="btn-ghost text-sm">
            Add
          </button>
        </div>
      </div>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` (the only remaining error should be the detail page not yet passing `show_time` in the `showDates` prop — fixed in Task 7; if EditableProductionHeader itself is clean, good) and `npm test` (green).

Note: tsc will report that `src/app/productions/[id]/page.tsx` passes `showDates` without `show_time`. That is fixed in Task 7. Confirm no other errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditableProductionHeader.tsx
git commit -m "feat: click title to edit; add showing times in the edit dialog"
```

---

## Task 7: Detail page — next showing + read-only Showings list

**Files:**
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Import `formatShowTime`**

Change the countdown import to add `formatShowTime` (keep `formatShowDate, latestDate, nextUpcomingDate, todayIso`):
```typescript
import { formatShowDate, formatShowTime, latestDate, nextUpcomingDate, todayIso } from "@/lib/countdown";
```

- [ ] **Step 2: Compute the next showing (date + time)**

Find the line `const nextUpcoming = nextUpcomingDate(showDates.map((d) => d.show_date), todayIso());` and the `displayDate` line below the status computation. Replace the `nextUpcoming` line and the `displayDate` line with a single next-showing computation. Specifically:

Delete:
```typescript
  const nextUpcoming = nextUpcomingDate(showDates.map((d) => d.show_date), todayIso());
```
and (a few lines down):
```typescript
  // For past productions there is no upcoming date — fall back to the most recent
  // (past) show date so the header shows the date rather than the word "Past".
  const displayDate = nextUpcoming ?? latestDate(showDates.map((d) => d.show_date));
```

Add, right after the `statusLabel` line:
```typescript
  // showDates arrive sorted by date then time. The next showing is the first one
  // dated today-or-later; for a past production, fall back to the last showing.
  const today = todayIso();
  const upcomingShowings = showDates.filter((s) => s.show_date >= today);
  const nextShowing = upcomingShowings[0] ?? showDates[showDates.length - 1] ?? null;
```

(`nextUpcomingDate` and `latestDate` may now be unused in this file — remove them from the import if so to keep tsc/lint clean: `import { formatShowDate, formatShowTime, todayIso } from "@/lib/countdown";`. `classifyProduction` still uses `todayIso`.)

- [ ] **Step 3: Render the next showing in the header**

Replace the header right-column date span + badge:
```typescript
          {displayDate && <span className="text-sm muted">{formatShowDate(displayDate)}</span>}
          <CountdownBadge showDate={displayDate} />
```
with:
```typescript
          {nextShowing && (
            <span className="text-sm muted">
              {formatShowDate(nextShowing.show_date)}
              {nextShowing.show_time ? ` · ${formatShowTime(nextShowing.show_time)}` : ""}
            </span>
          )}
          <CountdownBadge showDate={nextShowing ? nextShowing.show_date : null} />
```

- [ ] **Step 4: Pass `show_time` to the edit header**

Change the `EditableProductionHeader` `showDates` prop mapping to include `show_time`:
```typescript
          showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date, show_time: d.show_time }))}
```

- [ ] **Step 5: Add the read-only Showings list**

Immediately after the closing `</div>` of the header row (the `<div className="mt-2 mb-6 flex items-start justify-between gap-3">` block) and before `<ProductionWorkspace`, insert:
```typescript
      {showDates.length > 0 && (
        <div className="mb-6 space-y-1">
          <span className="lbl block">Showings</span>
          <ul className="space-y-1">
            {showDates.map((s) => (
              <li key={s.id} className="text-sm muted">
                {formatShowDate(s.show_date)}
                {s.show_time ? ` · ${formatShowTime(s.show_time)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npm test` (green).

- [ ] **Step 7: Commit**

```bash
git add "src/app/productions/[id]/page.tsx"
git commit -m "feat: detail page shows next showing time + read-only Showings list"
```

---

## Task 8: Full verification pass

- [ ] **Step 1: Whole suite + types + lint**

Run: `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (no new errors; pre-existing test-file warnings OK).

- [ ] **Step 2: Manual smoke (after Chris applies migration 0008)**

- Edit dialog: clicking the **production name** opens it (no separate Edit link).
- Add two showings on the same date with different times (2:00 PM, 7:00 PM) — both appear; adding an exact same date+time again is blocked.
- Dates everywhere read "Sat, Jun 13, 2026"; timed showings read "Sat, Jun 13, 2026 · 2:00 PM".
- Detail header shows the next showing with its time; the read-only "Showings" list shows the full run sorted by date then time.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** show_time column (T1); formatShowDate weekday + formatShowTime (T2); data layer time + ordering (T3); POST route time (T4); create-flow null time (T5); title-to-edit + time input + dup guard + display (T6); detail next-showing + Showings list (T7). All mapped.
- **Breaking change handled:** `addShowDate(productionId, date, time)` — both callers (show-dates route, productions route) updated (T4, T5); the data test and both route tests updated.
- **Time normalization:** DB returns `"HH:MM:SS"`, input gives `"HH:MM"`; the duplicate guard compares `(show_time ?? "").slice(0,5)` to `newTime`, and `formatShowTime` handles both forms.
- **Date-level classification unchanged:** `production-status`, `nextUpcomingDate`, `latestDate` untouched; matinee duplicate dates are harmless to the date-array logic. List cards get weekdays free via `formatShowDate`.
- **Type consistency:** `ShowDate.show_time: string | null`, `ShowDateItem.show_time: string | null`, `addShowDate(id, date, time)`, `formatShowTime(time)` consistent across tasks.
