# Showing Labels (Phase 3a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional free-text label per showing (e.g. "Tech rehearsal", "Opening Night"), set in the create form and the detail-page showings editor, shown wherever showings display.

**Architecture:** Add a nullable `show_dates.label` (migration 0015); thread it through the data layer, the showings helper, the show-dates + productions routes, both showing editors, and `ShowingsList`.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase, Vitest. **Requires migration 0015 applied to Supabase on deploy.** Spec: `docs/superpowers/specs/2026-06-11-showing-labels-design.md`.

**Conventions:** data/helper TDD'd; routes mock deps in tests; components verified via tsc/lint/manual. Blank labels persist as `null`.

---

## File Structure

- **Create** `supabase/migrations/0015_show_date_labels.sql`
- **Modify** `src/lib/data/show-dates.ts` (+ test) — `label` on `ShowDate`, `addShowDate`, `updateShowDate`
- **Modify** `src/lib/showings.ts` (+ test) — `label` on `ShowingInput` + `normalizeShowings`
- **Modify** `src/app/api/productions/[id]/show-dates/route.ts` (+ test), `…/[dateId]/route.ts` (+ test), `src/app/api/productions/route.ts` (+ test)
- **Modify** `src/components/EditableProductionHeader.tsx`, `src/app/productions/new/page.tsx`, `src/components/ShowingsList.tsx`, `src/app/productions/page.tsx`, `src/app/productions/[id]/page.tsx`

---

## Task 1: DB + data layer + showings helper

**Files:**
- Create: `supabase/migrations/0015_show_date_labels.sql`
- Modify: `src/lib/data/show-dates.ts`, its test(s)
- Modify: `src/lib/showings.ts`, `src/lib/showings.test.ts`

- [ ] **Step 1: Migration**

Create `supabase/migrations/0015_show_date_labels.sql`:

```sql
-- Optional free-text label per showing (e.g. "Tech rehearsal", "Opening Night").
alter table show_dates add column if not exists label text;
```

- [ ] **Step 2: `normalizeShowings` carries label (failing test first)**

In `src/lib/showings.test.ts`, add:

```ts
test("normalizeShowings carries a trimmed label and nulls a blank one", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "19:00", label: "  Opening Night " },
      { date: "2026-11-02", time: "", label: "   " },
      { date: "2026-11-03", time: "" },
    ]),
  ).toEqual([
    { date: "2026-11-01", time: "19:00", label: "Opening Night" },
    { date: "2026-11-02", time: null, label: null },
    { date: "2026-11-03", time: null, label: null },
  ]);
});

test("normalizeShowings dedupes by date+time, keeping the first label", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "19:00", label: "Tech" },
      { date: "2026-11-01", time: "19:00", label: "Other" },
    ]),
  ).toEqual([{ date: "2026-11-01", time: "19:00", label: "Tech" }]);
});
```

Also update the EXISTING `normalizeShowings` test expectations in this file: each expected object currently is `{ date, time }` — add `label: null` to every expected object so they still match (the rows in those tests have no label).

Run: `npx vitest run src/lib/showings.test.ts` → FAIL.

- [ ] **Step 3: Update `normalizeShowings`**

In `src/lib/showings.ts`:

```ts
export interface ShowingInput {
  date: string;
  time: string | null;
  label: string | null;
}

export function normalizeShowings(rows: { date: string; time: string; label?: string }[]): ShowingInput[] {
  const seen = new Set<string>();
  const out: ShowingInput[] = [];
  for (const row of rows) {
    const date = row.date.trim();
    if (!date) continue;
    const time = row.time.trim() || null;
    const key = `${date}|${time ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = (row.label ?? "").trim() || null;
    out.push({ date, time, label });
  }
  return out;
}
```

Run: `npx vitest run src/lib/showings.test.ts` → PASS.

- [ ] **Step 4: `show-dates.ts` data layer (failing test first)**

Read `src/lib/data/show-dates.ts` and its test file(s) (`show-dates.test.ts`, and `show-dates-update.test.ts` if present). Add `label` coverage: an `addShowDate` test passing a label asserts the insert includes `label: "Tech rehearsal"` (and a blank/absent label inserts `label: null`); an `updateShowDate` test passing `{ label: "X" }` asserts the update includes `label: "X"`. Add `label` to existing `addShowDate`/`updateShowDate` test assertions where the insert/update object is asserted (the existing rows have no label → `label: null` on insert).

Run the show-dates test file(s) → FAIL.

- [ ] **Step 5: Implement label in `show-dates.ts`**

In `src/lib/data/show-dates.ts`:

(a) `ShowDate` interface: add `label: string | null;` after `show_time`.

(b) `addShowDate` — new optional 4th param + insert:

```ts
export async function addShowDate(
  productionId: string,
  date: string,
  time: string | null,
  label?: string | null,
): Promise<ShowDate> {
  const show_date = date.trim();
  if (!show_date) throw new ValidationError("Show date is required");
  const labelClean = label && label.trim() ? label.trim() : null;
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .insert({ production_id: productionId, show_date, show_time: time || null, label: labelClean })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShowDate;
}
```

(c) `updateShowDate` — `patch` gains `label`; include when present:

```ts
export async function updateShowDate(
  productionId: string,
  id: string,
  patch: { show_date?: string; show_time?: string | null; label?: string | null },
): Promise<ShowDate> {
  const update: { show_date?: string; show_time?: string | null; label?: string | null } = {};
  if (patch.show_date !== undefined) {
    const trimmed = patch.show_date.trim();
    if (!trimmed) throw new ValidationError("Show date is required");
    update.show_date = trimmed;
  }
  if (patch.show_time !== undefined) {
    update.show_time = patch.show_time || null;
  }
  if (patch.label !== undefined) {
    update.label = patch.label && patch.label.trim() ? patch.label.trim() : null;
  }
  const { data, error } = await supabaseAdmin
    .from("show_dates")
    .update(update)
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Showing not found");
  return data as ShowDate;
}
```

Run the show-dates test file(s) → PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add supabase/migrations/0015_show_date_labels.sql src/lib/data/show-dates.ts src/lib/data/show-dates.test.ts src/lib/data/show-dates-update.test.ts src/lib/showings.ts src/lib/showings.test.ts
git commit -m "feat: show_dates.label column, data layer, and normalizeShowings support"
```

(If `show-dates-update.test.ts` doesn't exist, drop it from the `git add`.)

---

## Task 2: API routes carry the label

**Files:**
- Modify: `src/app/api/productions/[id]/show-dates/route.ts` (+ test)
- Modify: `src/app/api/productions/[id]/show-dates/[dateId]/route.ts` (+ test)
- Modify: `src/app/api/productions/route.ts` (+ test)

- [ ] **Step 1: Update the show-dates POST + PATCH routes**

In `src/app/api/productions/[id]/show-dates/route.ts`, the POST body type + call:

```ts
    const body = (await request.json()) as { date?: string; time?: string; label?: string };
    const showDate = await addShowDate(
      id,
      typeof body.date === "string" ? body.date : "",
      typeof body.time === "string" ? body.time : null,
      typeof body.label === "string" ? body.label : null,
    );
```

In `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`, the PATCH body type + patch:

```ts
    const body = (await request.json()) as { date?: string; time?: string; label?: string };
    const patch: { show_date?: string; show_time?: string | null; label?: string | null } = {};
    if (typeof body.date === "string") patch.show_date = body.date;
    if (typeof body.time === "string") patch.show_time = body.time;
    if (typeof body.label === "string") patch.label = body.label;
```

- [ ] **Step 2: Update the create-production route**

In `src/app/api/productions/route.ts`:

(a) Widen the `showings` body type to include `label`:

```ts
      showings?: { date?: string; time?: string | null; label?: string | null }[];
```

(b) In the `showings` loop, pass the label to `addShowDate`. The loop becomes:

```ts
    if (Array.isArray(body.showings)) {
      for (const s of body.showings) {
        const date = typeof s?.date === "string" ? s.date.trim() : "";
        if (!date) continue;
        const time = typeof s?.time === "string" && s.time.trim() ? s.time.trim() : null;
        const label = typeof s?.label === "string" ? s.label : null;
        await addShowDate(production.id, date, time, label);
      }
    } else if (typeof body.showDate === "string" && body.showDate.trim()) {
      await addShowDate(production.id, body.showDate, null);
    }
```

- [ ] **Step 3: Update the route tests**

Read each of `src/app/api/productions/[id]/show-dates/route.test.ts`, `…/[dateId]/route.test.ts`, and `src/app/api/productions/route.test.ts`, and extend:
- show-dates POST: a test posting `{ date, time, label: "Tech rehearsal" }` asserts `addShowDate` was called with `(id, date, time, "Tech rehearsal")`. (Existing no-label tests now pass `null` as the 4th arg — update those assertions to `addShowDate.toHaveBeenCalledWith(id, date, time, null)` if they assert the args.)
- show-dates PATCH: a test patching `{ label: "X" }` asserts `updateShowDate` got a patch including `label: "X"`.
- productions POST: a `showings` test with a `label` asserts `addShowDate` received the label as the 4th arg. Existing `showings`/`showDate` tests: the `showings` path now passes a 4th arg (`null` when no label) — update those `toHaveBeenCalledWith` assertions accordingly; the legacy `showDate` fallback call is unchanged (still `addShowDate(id, date, null)`).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run "src/app/api/productions/[id]/show-dates/route.test.ts" "src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts" src/app/api/productions/route.test.ts && npx tsc --noEmit`
Expected: all pass; zero type errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/show-dates/route.ts" "src/app/api/productions/[id]/show-dates/route.test.ts" "src/app/api/productions/[id]/show-dates/[dateId]/route.ts" "src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts" src/app/api/productions/route.ts src/app/api/productions/route.test.ts
git commit -m "feat: show-dates + create routes accept a showing label"
```

---

## Task 3: UI — label input + display

**Files:**
- Modify: `src/components/ShowingsList.tsx`
- Modify: `src/components/EditableProductionHeader.tsx`
- Modify: `src/app/productions/new/page.tsx`
- Modify: `src/app/productions/page.tsx`
- Modify: `src/app/productions/[id]/page.tsx`

No component tests; verify via tsc/lint/full suite + manual.

- [ ] **Step 1: Display the label in ShowingsList**

In `src/components/ShowingsList.tsx`:

(a) Add `label?: string | null;` to the `Showing` interface (after `show_time`).

(b) In the list `<li>`, append the label segment:

```tsx
        <li key={s.id} className="text-sm muted">
          {formatShowDate(s.show_date)}
          {s.show_time ? ` · ${formatShowTime(s.show_time)}` : ""}
          {s.label ? ` · ${s.label}` : ""}
        </li>
```

- [ ] **Step 2: Pass label from the list-page map**

In `src/app/productions/page.tsx`, the `pastAndInactive` mapping currently maps `{ id, show_date, show_time }`. Add `label`:

```tsx
        showings: p.showings.map((s) => ({ id: s.id, show_date: s.show_date, show_time: s.show_time, label: s.label })),
```

(The active list passes full `p.showings` objects, which already include `label` after Task 1 — no change there.)

- [ ] **Step 3: Pass label into the detail-page editor + list**

In `src/app/productions/[id]/page.tsx`, the `<EditableProductionHeader ... showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date, show_time: d.show_time }))} ... />` mapping gains `label`:

```tsx
          showDates={showDates.map((d) => ({ id: d.id, show_date: d.show_date, show_time: d.show_time, label: d.label }))}
```

(The `<ShowingsList showings={showDates} ... />` already passes full `ShowDate` objects, which now include `label`.)

- [ ] **Step 4: Label input in the detail-page editor**

In `src/components/EditableProductionHeader.tsx`:

(a) `ShowDateItem` interface gains `label: string | null;`.

(b) `addDate` (the new-showing handler) sends a label. Add a `newLabel` state next to `newDate`/`newTime`:

```tsx
  const [newLabel, setNewLabel] = useState("");
```

and include it in the POST body of `addDate`:

```tsx
        body: JSON.stringify({ date: newDate, time: newTime || null, label: newLabel || null }),
```

and clear it on success (where `setNewDate("")`/`setNewTime("")` run): add `setNewLabel("");`.

(c) `saveShowing` already PATCHes a partial `patch`; it accepts `{ date?, time? }` today — widen its type to include `label?` and pass through. Find the `saveShowing` signature and change it to:

```tsx
  function saveShowing(dateId: string, patch: { date?: string; time?: string; label?: string }) {
```

(d) In each existing showing row, add a label input after the time input, saving on change:

```tsx
            <input
              type="text"
              className="field min-w-0 flex-1"
              defaultValue={d.label ?? ""}
              onChange={(e) => saveShowing(d.id, { label: e.target.value })}
              aria-label="Showing label"
              placeholder="Label — e.g. Tech rehearsal"
            />
```

(place it within the row's flex container, before the Remove button).

(e) In the add-new-showing row, add a label input bound to `newLabel` (before the Add button):

```tsx
          <input
            type="text"
            className="field min-w-0 flex-1"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            aria-label="Showing label (optional)"
            placeholder="Label (optional)"
          />
```

(Also reset `newLabel` in the editor's Done/cancel reset block alongside `setNewDate("")`/`setNewTime("")` if present.)

- [ ] **Step 5: Label input in the create form**

In `src/app/productions/new/page.tsx`:

(a) `ShowingRow` interface gains `label: string;`.

(b) Initial state row + `addRow` use `{ date: "", time: "", label: "" }`.

(c) Each row renders a label input after the time input:

```tsx
              <input
                type="text"
                className="field min-w-0 flex-1"
                value={s.label}
                onChange={(e) => updateShowing(i, { label: e.target.value })}
                aria-label="Showing label (optional)"
                placeholder="Label (optional)"
              />
```

(`normalizeShowings` already accepts `label?` and the submit already calls `normalizeShowings(showings)`, which now carries the label — no submit change needed.)

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no new lint errors, all tests pass.

- [ ] **Step 7: Manual verification**

Run: `npm run dev` (migration 0015 applied). Verify: create a production with a labeled showing ("Tech rehearsal") → label shows on the list + detail; edit/add a label in the detail editor → persists on reload; blank label shows no extra segment.

- [ ] **Step 8: Commit**

```bash
git add src/components/ShowingsList.tsx src/components/EditableProductionHeader.tsx src/app/productions/new/page.tsx src/app/productions/page.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: showing label input (create + editor) and display"
```

---

## Deploy Note

Adds migration `0015_show_date_labels.sql` — apply to Supabase on deploy.

## Self-Review Notes

- **Spec coverage:** label column + data layer + helper (Task 1); show-dates + create routes (Task 2); editor + create form inputs + display (Task 3). All entry/display points covered.
- **Type consistency:** `label: string | null` on `ShowDate`/`ShowingInput`; `ShowingsList.Showing.label?` optional so untouched callers compile; `addShowDate`'s 4th param optional so other callers (the legacy `showDate` fallback) are unaffected.
- **Back-compat:** existing showings tests get `label: null` added to their assertions; the `addShowDate` legacy call (no label) still works (param optional).
- **No placeholders:** complete code for data/helper/routes; precise edits for the UI with the exact inputs to add.
