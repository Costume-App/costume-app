# Phase 2 — Active vs. "Past and Inactives" + relocate delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the productions list into Active and a collapsible "Past and Inactives" group, sorted by show date, with a manual active/inactive toggle and the delete control relocated to the bottom of the detail page.

**Architecture:** A pure, tested `production-status` module classifies each production (active/past/inactive) from `is_active` + its show dates + today, and partitions+sorts the list. A new `is_active` column (migration 0007) plus `setProductionActive` data fn, surfaced through the existing `PATCH /api/productions/[id]`. List page renders Active server-side and hands the rest to a client `PastAndInactiveProductions`. Detail page gains a status tag and a bottom footer with a `ToggleProductionActiveButton` and the relocated (now inline) `DeleteProductionButton`.

**Tech Stack:** Next.js 16 (async params), TypeScript strict, Supabase (`supabaseAdmin`), Clerk (`getAuthContext`), Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-active-inactive-productions-design.md`

**Conventions:** data fns throw `ValidationError`/`NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data → JSON via `errorResponse`. Vitest mocks chain via `vi.fn()` returning the next builder step.

---

## Task 1: Migration `0007_productions_is_active.sql`

**Files:**
- Create: `supabase/migrations/0007_productions_is_active.sql`

- [ ] **Step 1: Create the file**

```sql
-- Manual active/inactive flag. Existing productions stay active.
alter table productions add column is_active boolean not null default true;
```

- [ ] **Step 2: Commit (Chris applies it in Supabase; do NOT apply here)**

```bash
git add supabase/migrations/0007_productions_is_active.sql
git commit -m "feat: 0007 productions.is_active column"
```

> **MANUAL STEP (Chris):** apply in the Supabase SQL editor before exercising the app. Tests use mocks and don't need the DB.

---

## Task 2: `production-status` helper

**Files:**
- Test: `src/lib/production-status.test.ts` (create)
- Create: `src/lib/production-status.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/production-status.test.ts`:

```typescript
import { expect, test } from "vitest";
import { classifyProduction, partitionProductions } from "@/lib/production-status";

const TODAY = "2026-06-15";

test("classifyProduction: manually hidden is inactive even with future dates", () => {
  expect(classifyProduction(false, ["2026-09-01"], TODAY)).toBe("inactive");
});

test("classifyProduction: active flag with all past dates is past", () => {
  expect(classifyProduction(true, ["2026-01-01", "2026-05-01"], TODAY)).toBe("past");
});

test("classifyProduction: active flag with an upcoming date is active", () => {
  expect(classifyProduction(true, ["2026-05-01", "2026-09-01"], TODAY)).toBe("active");
});

test("classifyProduction: active flag with no dates is active", () => {
  expect(classifyProduction(true, [], TODAY)).toBe("active");
});

test("partitionProductions: buckets and sorts active by next upcoming, undated last", () => {
  const items = [
    { id: "a", is_active: true, created_at: "2026-01-01", dates: ["2026-09-01"] },
    { id: "b", is_active: true, created_at: "2026-02-01", dates: ["2026-07-01"] },
    { id: "c", is_active: true, created_at: "2026-03-01", dates: [] },
    { id: "d", is_active: false, created_at: "2026-04-01", dates: ["2026-08-01"] },
    { id: "e", is_active: true, created_at: "2026-05-01", dates: ["2026-02-01"] },
  ];
  const { active, inactive } = partitionProductions(items, TODAY);
  // active: b (Jul) before a (Sep), then undated c last; e is past, d is hidden
  expect(active.map((p) => p.id)).toEqual(["b", "a", "c"]);
  // inactive bucket sorted by latest date desc: d (Aug) before e (Feb)
  expect(inactive.map((p) => p.id)).toEqual(["d", "e"]);
});

test("partitionProductions: inactive sorts by latest date desc, undated last", () => {
  const items = [
    { id: "x", is_active: false, created_at: "2026-01-01", dates: [] },
    { id: "y", is_active: true, created_at: "2026-02-01", dates: ["2026-03-01"] },
    { id: "z", is_active: true, created_at: "2026-03-01", dates: ["2026-05-10"] },
  ];
  const { inactive } = partitionProductions(items, TODAY);
  // z (May 10) before y (Mar 1), undated x last
  expect(inactive.map((p) => p.id)).toEqual(["z", "y", "x"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- production-status`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/production-status.ts`**

```typescript
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- production-status`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/production-status.ts src/lib/production-status.test.ts
git commit -m "feat: production-status classify + partition/sort helpers"
```

---

## Task 3: `productions.ts` — `is_active` + `setProductionActive`

**Files:**
- Modify: `src/lib/data/productions.ts`
- Test: `src/lib/data/productions-set-active.test.ts` (create)

- [ ] **Step 1: Update `src/lib/data/productions.ts`**

1. In `interface Production`, add a field (e.g. after `notes`):

```typescript
  is_active: boolean;
```

2. Append after `updateProduction`:

```typescript
export async function setProductionActive(orgId: string, id: string, isActive: boolean): Promise<Production> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Production not found");
  return data as Production;
}
```

(`NotFoundError` is already imported as of Phase 1.)

- [ ] **Step 2: Create `src/lib/data/productions-set-active.test.ts`**

```typescript
import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqOrg = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqOrg }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setProductionActive } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setProductionActive updates is_active scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", title: "Annie", is_active: false }, error: null });
  const row = await setProductionActive("org_1", "p1", false);
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ is_active: false });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", title: "Annie", is_active: false });
});

test("setProductionActive throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setProductionActive("org_1", "nope", true)).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 3: Run**

Run: `npm test -- productions` then `npx tsc --noEmit`
Expected: all productions tests pass (incl. the new file). NOTE: tsc may now report errors in `src/app/productions/page.tsx` / `[id]/page.tsx` only if they already reference `is_active` — they don't yet, so tsc should stay clean. Report any errors with files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/productions-set-active.test.ts
git commit -m "feat: is_active on Production + setProductionActive"
```

---

## Task 4: `PATCH /api/productions/[id]` — handle `isActive`

**Files:**
- Modify: `src/app/api/productions/[id]/route.ts`
- Modify: `src/app/api/productions/[id]/route.test.ts`

- [ ] **Step 1: Update the route**

In `src/app/api/productions/[id]/route.ts`:

1. Change `import { deleteProduction, updateProduction } from "@/lib/data/productions";` to:

```typescript
import { deleteProduction, updateProduction, setProductionActive } from "@/lib/data/productions";
```

2. Replace the existing `PATCH` handler with:

```typescript
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { title?: string; isActive?: boolean };
    if (typeof body.isActive === "boolean") {
      const production = await setProductionActive(orgId, id, body.isActive);
      return NextResponse.json({ production });
    }
    const production = await updateProduction(orgId, id, typeof body.title === "string" ? body.title : "");
    return NextResponse.json({ production });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Update the test**

In `src/app/api/productions/[id]/route.test.ts`:

1. Add `setProductionActive` to the productions mock:

```typescript
const deleteProduction = vi.fn();
const updateProduction = vi.fn();
const setProductionActive = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
  updateProduction: (...a: unknown[]) => updateProduction(...a),
  setProductionActive: (...a: unknown[]) => setProductionActive(...a),
}));
```

2. Add `setProductionActive` to the `beforeEach` reset array.

3. Append these tests:

```typescript
test("PATCH with isActive=false hides the production via setProductionActive (200)", async () => {
  setProductionActive.mockResolvedValue({ id: "p1", title: "Annie", is_active: false });
  const res = await PATCH(patchReq({ isActive: false }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: "p1", title: "Annie", is_active: false } });
  expect(setProductionActive).toHaveBeenCalledWith("org_1", "p1", false);
  expect(updateProduction).not.toHaveBeenCalled();
});

test("PATCH with isActive=true reactivates the production (200)", async () => {
  setProductionActive.mockResolvedValue({ id: "p1", title: "Annie", is_active: true });
  const res = await PATCH(patchReq({ isActive: true }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(setProductionActive).toHaveBeenCalledWith("org_1", "p1", true);
});
```

(The Phase 1 `patchReq` helper and the title-PATCH test already exist — leave them; the title test still passes because `isActive` is absent.)

- [ ] **Step 3: Run**

Run: `npm test -- "api/productions/[id]/route"` (or `npm test`) then `npx tsc --noEmit`
Expected: all route tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/route.ts" "src/app/api/productions/[id]/route.test.ts"
git commit -m "feat: PATCH /api/productions/[id] toggles is_active"
```

---

## Task 5: List page — Active + "Past and Inactives"

**Files:**
- Create: `src/components/PastAndInactiveProductions.tsx`
- Modify: `src/app/productions/page.tsx`

- [ ] **Step 1: Create the client component**

Create `src/components/PastAndInactiveProductions.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CountdownBadge } from "@/components/CountdownBadge";
import { formatShowDate } from "@/lib/countdown";

interface Row {
  id: string;
  title: string;
  displayDate: string | null;
}

export function PastAndInactiveProductions({ productions }: { productions: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (productions.length === 0) return null;

  async function makeActive(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/productions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't reactivate");
      setBusyId(null);
      return;
    }
    setBusyId(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted mt-6 text-sm">
        Show past &amp; inactive ({productions.length})
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="lbl">Past and Inactives</span>
        <button type="button" onClick={() => setOpen(false)} className="link-muted text-sm">
          Hide
        </button>
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <ul className="space-y-3">
        {productions.map((p) => (
          <li key={p.id} className="surface">
            <div className="flex items-center justify-between gap-3 p-4">
              <Link href={`/productions/${p.id}`} className="font-display text-xl font-semibold">
                {p.title}
              </Link>
              <div className="flex items-center gap-2">
                {p.displayDate && <span className="text-sm muted">{formatShowDate(p.displayDate)}</span>}
                <CountdownBadge showDate={p.displayDate} />
                <button
                  type="button"
                  onClick={() => makeActive(p.id)}
                  disabled={busyId === p.id}
                  className="link-red text-sm"
                >
                  {busyId === p.id ? "…" : "Make active"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/productions/page.tsx`**

1. Change the imports:

```tsx
import { CountdownBadge } from "@/components/CountdownBadge";
import { PastAndInactiveProductions } from "@/components/PastAndInactiveProductions";
import { formatShowDate, nextUpcomingDate, latestDate, todayIso } from "@/lib/countdown";
import { partitionProductions } from "@/lib/production-status";
```

(Keep the other existing imports: `Link`, `UserButton`, `currentUser`/`clerkClient`, `getAuthContext`, `listProductions`, `listShowDates`.)

2. Replace the date-map block (currently builds `nextByProduction`) with partitioning. Replace:

```tsx
  const allShowDates = await listShowDates(productions.map((p) => p.id));
  const today = todayIso();
  const nextByProduction = new Map<string, string | null>();
  for (const p of productions) {
    const dates = allShowDates.filter((d) => d.production_id === p.id).map((d) => d.show_date);
    nextByProduction.set(p.id, nextUpcomingDate(dates, today));
  }
```

with:

```tsx
  const allShowDates = await listShowDates(productions.map((p) => p.id));
  const today = todayIso();
  const withDates = productions.map((p) => ({
    ...p,
    dates: allShowDates.filter((d) => d.production_id === p.id).map((d) => d.show_date),
  }));
  const { active, inactive } = partitionProductions(withDates, today);
  const pastAndInactive = inactive.map((p) => ({
    id: p.id,
    title: p.title,
    displayDate: nextUpcomingDate(p.dates, today) ?? latestDate(p.dates),
  }));
```

3. Replace the list-rendering block. The empty-state condition should consider the whole set. Replace the entire `{productions.length === 0 ? (...) : (...)}` block with:

```tsx
      {productions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          No productions yet. Create your first show to get started.
        </p>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="space-y-3">
              {active.map((p) => {
                const next = nextUpcomingDate(p.dates, today);
                return (
                  <li key={p.id} className="surface transition-transform hover:-translate-y-0.5">
                    <Link href={`/productions/${p.id}`} className="block p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-display text-xl font-semibold">{p.title}</span>
                        <div className="flex items-center gap-2">
                          {next && <span className="text-sm muted">{formatShowDate(next)}</span>}
                          <CountdownBadge showDate={next} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <PastAndInactiveProductions productions={pastAndInactive} />
        </>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (clean) and `npm run lint` (no new errors) and `npm test` (green).

- [ ] **Step 4: Commit**

```bash
git add src/components/PastAndInactiveProductions.tsx src/app/productions/page.tsx
git commit -m "feat: list splits into Active and Past and Inactives"
```

---

## Task 6: Detail page — status tag, toggle, relocate + inline delete

**Files:**
- Create: `src/components/ToggleProductionActiveButton.tsx`
- Modify: `src/components/DeleteProductionButton.tsx` (popover → inline)
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/ToggleProductionActiveButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ToggleProductionActiveButton({
  productionId,
  isActive,
}: {
  productionId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={toggle} disabled={busy} className="link-muted text-sm">
        {busy ? "…" : isActive ? "Make inactive" : "Make active"}
      </button>
      {error && <p className="text-[var(--red)] mt-1 text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Convert `DeleteProductionButton` from popover to inline**

In `src/components/DeleteProductionButton.tsx`, change the outer wrapper and panel container. Replace:

```tsx
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={open}
        className="link-muted text-sm"
      >
        Delete production
      </button>
      {open && (
        <div className="surface absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-3rem)] space-y-3 p-4 text-left">
```

with:

```tsx
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={open}
        className="link-muted text-sm"
      >
        Delete production
      </button>
      {open && (
        <div className="surface mt-2 w-full max-w-md space-y-3 p-4">
```

(Everything else in the component stays the same.)

- [ ] **Step 3: Update `src/app/productions/[id]/page.tsx`**

1. Add imports (keep existing ones, including `DeleteProductionButton`, `todayIso`, `formatShowDate`, `CountdownBadge`):

```tsx
import { classifyProduction } from "@/lib/production-status";
import { ToggleProductionActiveButton } from "@/components/ToggleProductionActiveButton";
```

2. After `nextUpcoming` is computed, add the status label:

```tsx
  const status = classifyProduction(production.is_active, showDates.map((d) => d.show_date), todayIso());
  const statusLabel = status === "inactive" ? "Inactive" : status === "past" ? "Past" : null;
```

3. Remove `DeleteProductionButton` from the header back-link row. Replace:

```tsx
      <div className="flex items-center justify-between">
        <Link href="/productions" className="link-muted text-sm">
          ← Productions
        </Link>
        <DeleteProductionButton productionId={id} />
      </div>
```

with:

```tsx
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
```

4. Add the status tag to the right-hand header column. Replace:

```tsx
        <div className="flex flex-col items-end gap-1">
          {nextUpcoming && <span className="text-sm muted">{formatShowDate(nextUpcoming)}</span>}
          <CountdownBadge showDate={nextUpcoming} />
        </div>
```

with:

```tsx
        <div className="flex flex-col items-end gap-1">
          {statusLabel && <span className="chip">{statusLabel}</span>}
          {nextUpcoming && <span className="text-sm muted">{formatShowDate(nextUpcoming)}</span>}
          <CountdownBadge showDate={nextUpcoming} />
        </div>
```

5. Add the bottom footer immediately before the closing `</main>` (after the `<ProductionWorkspace ... />` element):

```tsx
      <div className="mt-8 space-y-4 border-t border-[var(--field-line)] pt-4">
        <ToggleProductionActiveButton productionId={id} isActive={production.is_active} />
        <DeleteProductionButton productionId={id} />
      </div>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npm test` (green).

- [ ] **Step 5: Commit**

```bash
git add src/components/ToggleProductionActiveButton.tsx src/components/DeleteProductionButton.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: status tag, active toggle, relocated inline delete on detail page"
```

---

## Task 7: Full verification pass

- [ ] **Step 1: Whole suite**

Run: `npm test`
Expected: all pass (new production-status + set-active + PATCH isActive tests included).

- [ ] **Step 2: Types + lint**

Run: `npx tsc --noEmit` (clean) and `npm run lint` (no new errors; pre-existing test-file warnings OK).

- [ ] **Step 3: Manual smoke (after Chris applies migration 0007)**

- A production with an upcoming date shows under Active; one whose dates are all in the past shows only under **"Show past & inactive (N)"**.
- Active list is ordered soonest-date-first.
- On a production's page: **Make inactive** moves it to Past and Inactives (and shows the "Inactive" tag); **Make active** from the list or the detail toggle brings a hidden one back.
- A production whose dates passed shows the **"Past"** tag; adding a future date (Edit) returns it to Active.
- Delete now sits at the bottom, expands inline, still requires typing `delete`.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** is_active column (T1); classify + partition/sort (T2); setProductionActive + interface (T3); PATCH isActive (T4); list Active/"Past and Inactives" + Make active (T5); detail status tag + toggle + relocated inline delete (T6). All spec items mapped.
- **Type consistency:** `classifyProduction(isActive, dates, today)`, `partitionProductions(items, today) → {active, inactive}`, `setProductionActive(orgId, id, isActive)`, PATCH body `{ title?, isActive? }`, `PastAndInactiveProductions({productions: {id,title,displayDate}[]})`, `ToggleProductionActiveButton({productionId, isActive})` — used identically across tasks.
- **Inline-delete-at-bottom:** footer is a vertical stack (`space-y-4`), so the inline delete panel expands full-width without the header-flex squish that originally forced the popover.
- **Sorting tiebreak:** undated items sort last in both buckets; newest-created first as the tiebreak (verified by the partition tests).
