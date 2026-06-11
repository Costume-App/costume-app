# Costumes-Due Date + Countdown + Roll-up (Phase 3b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An explicit costumes-due date per production, a countdown to it, and an outstanding roll-up ("M of T made · N still to make"), shown on the production detail page and the Tailor's summary.

**Architecture:** Add nullable `productions.costumes_due_date` (migration 0016) with a focused setter + PATCH branch. A presentational `CostumesDueSummary` renders the countdown (reusing `countdown()`) + roll-up from the worklist's existing `totalItems`/`madeItems` counts. Shown live in `TailorSummary` and as a server-rendered snapshot in the detail-page header.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase, Vitest. **Requires migration 0016 applied to Supabase on deploy.** Spec: `docs/superpowers/specs/2026-06-11-costumes-due-countdown-design.md`.

**Conventions:** productions PATCH uses focused per-field setters (`setProductionActive`, `setProductionNotes`) and the route branches on which field is present — `costumes_due_date` follows the same shape. `buildMakeWorklist` already returns `{ roles, totalItems, madeItems }`; the roll-up uses those counts directly (no new helper needed). `countdown(date, today)` + `todayIso()` exist in `@/lib/countdown`.

---

## File Structure

- **Create** `supabase/migrations/0016_costumes_due_date.sql`
- **Modify** `src/lib/data/productions.ts` (+ test) — `costumes_due_date` + `setCostumesDue`
- **Modify** `src/app/api/productions/[id]/route.ts` (+ test) — PATCH `costumesDueDate`
- **Create** `src/components/CostumesDueSummary.tsx` — countdown + roll-up display
- **Modify** `src/components/EditableProductionHeader.tsx` — due-date input
- **Modify** `src/components/TailorSummary.tsx` + `src/app/productions/[id]/summary/page.tsx` — show summary (live)
- **Modify** `src/app/productions/[id]/page.tsx` — build worklist + show summary (snapshot)

---

## Task 1: DB + data layer + PATCH route

**Files:**
- Create: `supabase/migrations/0016_costumes_due_date.sql`
- Modify: `src/lib/data/productions.ts`, its test(s)
- Modify: `src/app/api/productions/[id]/route.ts`, its test

- [ ] **Step 1: Migration**

Create `supabase/migrations/0016_costumes_due_date.sql`:

```sql
-- Explicit "costumes due" deadline per production (director-set). Null = unset.
alter table productions add column if not exists costumes_due_date date;
```

- [ ] **Step 2: Data layer (failing test first)**

Read `src/lib/data/productions.ts` and its test file(s) (`productions.test.ts`, and any `productions-update.test.ts` / `productions-set-*.test.ts`). Add a test for a new `setCostumesDue`:

```ts
test("setCostumesDue updates the date scoped by id + org", async () => {
  // mirror the chained-mock style used by the sibling setProductionNotes/Active tests
  // (update -> eq(id) -> eq(org_id) -> select -> maybeSingle); assert:
  //   update called with { costumes_due_date: "2026-11-01" }
  //   returns the row
});

test("setCostumesDue stores null for a blank/null date", async () => {
  // setCostumesDue(orgId, id, "") and (orgId, id, null) → update called with { costumes_due_date: null }
});
```

Write these mirroring whichever existing setter test (e.g. the `setProductionActive`/`setProductionNotes` test) is closest in that file. Also add `costumes_due_date: null` to the `Production`-shaped fixtures in existing tests if any assert the full row shape (most assert only specific fields — leave those).

Run the productions test file → FAIL (setCostumesDue missing).

- [ ] **Step 3: Implement in productions.ts**

(a) Add `costumes_due_date: string | null;` to the `Production` interface (after `is_active`).

(b) Add the setter (mirrors `setProductionNotes`):

```ts
export async function setCostumesDue(orgId: string, id: string, date: string | null): Promise<Production> {
  const value = date && date.trim() ? date.trim() : null;
  const { data, error } = await supabaseAdmin
    .from("productions")
    .update({ costumes_due_date: value })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Production not found");
  return data as Production;
}
```

Run the productions test file → PASS.

- [ ] **Step 4: PATCH route (failing test first)**

In `src/app/api/productions/[id]/route.test.ts`, read it and add a test: PATCH with `{ costumesDueDate: "2026-11-01" }` calls `setCostumesDue(orgId, id, "2026-11-01")` and returns `{ production }`. (Mock `setCostumesDue` in the existing `@/lib/data/productions` mock.)

Run → FAIL.

- [ ] **Step 5: Implement the route branch**

In `src/app/api/productions/[id]/route.ts`:
- Add `setCostumesDue` to the import from `@/lib/data/productions`.
- Widen the body type: `{ title?: string; isActive?: boolean; notes?: string; costumesDueDate?: string | null }`.
- Add a branch BEFORE the title fallback (after the `notes` branch):

```ts
    if (body.costumesDueDate !== undefined) {
      const production = await setCostumesDue(orgId, id, body.costumesDueDate);
      return NextResponse.json({ production });
    }
```

Run the route test → PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: zero errors; all tests pass.

```bash
git add supabase/migrations/0016_costumes_due_date.sql src/lib/data/productions.ts src/lib/data/productions.test.ts "src/app/api/productions/[id]/route.ts" "src/app/api/productions/[id]/route.test.ts"
git commit -m "feat: productions.costumes_due_date + setCostumesDue + PATCH branch"
```

(Adjust the `git add` for the actual productions test filename(s) you edited.)

---

## Task 2: CostumesDueSummary + due-date input

**Files:**
- Create: `src/components/CostumesDueSummary.tsx`
- Modify: `src/components/EditableProductionHeader.tsx`

No component tests; verify via tsc/lint.

- [ ] **Step 1: Create CostumesDueSummary**

Create `src/components/CostumesDueSummary.tsx`:

```tsx
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
```

- [ ] **Step 2: Due-date input in EditableProductionHeader**

In `src/components/EditableProductionHeader.tsx` (READ it first):

(a) Add `costumesDue?: string | null;` (OPTIONAL, so this task's `tsc` is green before the detail page passes it in Task 3) to the component's props type + destructure.

(b) Add a saver using the existing `send` helper (mirrors `saveName`):

```tsx
  function saveCostumesDue(value: string) {
    return send(
      `/api/productions/${productionId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ costumesDueDate: value || null }) },
      "Couldn't save costumes-due date",
    );
  }
```

(c) In the expanded editor (the `surface` block with the name + showings), add a "Costumes due" field. Place it after the Showings section, before the bottom action row:

```tsx
      <label className="block">
        <span className="lbl mb-1 block">Costumes due</span>
        <input
          type="date"
          className="field w-full"
          defaultValue={costumesDue ?? ""}
          onChange={(e) => saveCostumesDue(e.target.value)}
        />
      </label>
```

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors; no new warnings. (`costumesDue` is optional, so the existing `<EditableProductionHeader>` call site still compiles; Task 3 passes the prop.)

```bash
git add src/components/CostumesDueSummary.tsx src/components/EditableProductionHeader.tsx
git commit -m "feat: CostumesDueSummary + costumes-due input in the production header"
```

---

## Task 3: Wire into the detail page + Tailor's summary

**Files:**
- Modify: `src/app/productions/[id]/page.tsx`
- Modify: `src/app/productions/[id]/summary/page.tsx`
- Modify: `src/components/TailorSummary.tsx`

- [ ] **Step 1: Detail page — pass costumesDue + render snapshot summary**

In `src/app/productions/[id]/page.tsx`:

(a) Imports:

```ts
import { buildMakeWorklist } from "@/lib/tailor-summary";
import { CostumesDueSummary } from "@/components/CostumesDueSummary";
```

(b) Pass `costumesDue` to `<EditableProductionHeader>` (add to its props):

```tsx
          costumesDue={production.costumes_due_date}
```

(c) After `pieces` is loaded (near the other derived values before `return`), compute the worklist:

```ts
  const worklist = buildMakeWorklist(
    roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes })),
    designs.map((d) => ({ id: d.id, role_id: d.role_id, name: d.name, display_order: d.display_order })),
    castings.map((c) => ({ id: c.id, cast_id: c.cast_id, role_id: c.role_id, performer_id: c.performer_id, assignment: c.assignment })),
    performers.map((p) => ({ id: p.id, name: p.label })),
    casts.map((c) => ({ id: c.id, name: c.name })),
    pieces,
  );
```

(d) Render `CostumesDueSummary` in the header area — directly after the closing `</div>` of the title/status header block and before the showings block:

```tsx
      <div className="mb-6">
        <CostumesDueSummary
          dueDate={production.costumes_due_date}
          today={todayIso()}
          total={worklist.totalItems}
          made={worklist.madeItems}
          href={`/productions/${id}/summary`}
        />
      </div>
```

(`todayIso` is already imported in this file.)

- [ ] **Step 2: Tailor's summary — pass costumesDue + today**

In `src/app/productions/[id]/summary/page.tsx`, pass two props to `<TailorSummary>`:

```tsx
        costumesDueDate={production.costumes_due_date}
        today={todayIso()}
```

Add `import { todayIso } from "@/lib/countdown";` at the top.

- [ ] **Step 3: TailorSummary — render the live summary at top**

In `src/components/TailorSummary.tsx`:

(a) Import: `import { CostumesDueSummary } from "@/components/CostumesDueSummary";`

(b) Add props to the type + destructure:

```ts
  costumesDueDate: string | null;
  today: string;
```

(c) Render the summary above the `<Tabs>` (first child of the returned `<div className="space-y-4">`). It uses the live `worklist` counts (recomputes as pieces toggle made):

```tsx
    <div className="space-y-4">
      <CostumesDueSummary
        dueDate={costumesDueDate}
        today={today}
        total={worklist.totalItems}
        made={worklist.madeItems}
      />
      <Tabs
```

- [ ] **Step 4: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors (all `<EditableProductionHeader>`/`<TailorSummary>` call sites now pass the new props), no new lint warnings, all tests pass.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (migration 0016 applied). Verify: set a "Costumes due" date in the production header editor → detail page shows "Costumes due in N days" + "M of T made · N still to make" linking to the summary; the Tailor's summary shows the same at top and the roll-up updates live as you check pieces made; clearing the date hides the countdown; a production with nothing to make shows no roll-up.

- [ ] **Step 6: Commit**

```bash
git add "src/app/productions/[id]/page.tsx" "src/app/productions/[id]/summary/page.tsx" src/components/TailorSummary.tsx
git commit -m "feat: show costumes-due countdown + outstanding roll-up on detail + summary"
```

---

## Deploy Note

Adds migration `0016_costumes_due_date.sql` — apply to Supabase on deploy.

## Self-Review Notes

- **Spec coverage:** due-date column + setter + PATCH (Task 1); `CostumesDueSummary` + the header input (Task 2); detail-page snapshot + live summary on the Tailor's summary (Task 3). The spec's optional `worklistProgress` helper was dropped as unnecessary — `buildMakeWorklist` already returns `totalItems`/`madeItems`, which `CostumesDueSummary` consumes directly (computing `outstanding = total - made`).
- **Type consistency:** `costumes_due_date` (DB/`Production`) ↔ `costumesDueDate` (API/prop); `CostumesDueSummary` props `{dueDate, today, total, made, href?}` used by both pages; `EditableProductionHeader` gains an OPTIONAL `costumesDue` prop (so each task's `tsc` is green standalone), passed at its call site in Task 3.
- **No placeholders:** complete code for data/route/component; precise edits for wiring. (Task 1's data/route test bodies are described against the file's existing sibling-setter test style — read and mirror.)
