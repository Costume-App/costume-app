# Multiple Showings on the Create Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the New Production form capture multiple showings (date + optional time each), submitted together on create.

**Architecture:** A pure `normalizeShowings` helper cleans the form's in-memory rows (trim, drop blank dates, blank time→null, dedupe exact pairs). The create form becomes a repeatable date+time row list submitting a `showings[]` array. The POST `/api/productions` handler accepts `showings[]` and calls the existing `addShowDate` per valid row, with the old single `showDate` kept as a fallback. No data-layer or schema change.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase, Vitest. `@/*` → `src/*`.

**Conventions (verified):**
- Data/logic helpers in `src/lib/*`; pure helpers unit-tested with Vitest (`npx vitest run <file>`).
- API routes: `getAuthContext()` → work → `errorResponse(err)` in catch; route tests mock the data modules.
- React components verified via `npx tsc --noEmit` + `npm run lint` + manual (no component tests in this repo).
- Spec: `docs/superpowers/specs/2026-06-10-create-form-multiple-showings-design.md`.

---

## File Structure

- **Create** `src/lib/showings.ts` — `ShowingInput` type + `normalizeShowings`.
- **Create** `src/lib/showings.test.ts` — unit tests.
- **Modify** `src/app/api/productions/route.ts` — accept `showings[]`, fall back to `showDate`.
- **Modify** `src/app/api/productions/route.test.ts` — multi-showing tests.
- **Modify** `src/app/productions/new/page.tsx` — repeatable date+time row UI.

---

## Task 1: `normalizeShowings` pure helper

**Files:**
- Create: `src/lib/showings.ts`
- Test: `src/lib/showings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/showings.test.ts`:

```ts
import { expect, test } from "vitest";
import { normalizeShowings } from "@/lib/showings";

test("drops rows with a blank or whitespace-only date", () => {
  expect(
    normalizeShowings([
      { date: "", time: "19:00" },
      { date: "   ", time: "" },
      { date: "2026-11-01", time: "" },
    ]),
  ).toEqual([{ date: "2026-11-01", time: null }]);
});

test("normalizes a blank or whitespace time to null and trims the date", () => {
  expect(normalizeShowings([{ date: "  2026-11-01 ", time: "   " }])).toEqual([
    { date: "2026-11-01", time: null },
  ]);
});

test("dedupes exact (date, time) pairs, preserving first-seen order", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-02", time: "19:00" },
      { date: "2026-11-01", time: "14:00" },
      { date: "2026-11-02", time: "19:00" },
    ]),
  ).toEqual([
    { date: "2026-11-02", time: "19:00" },
    { date: "2026-11-01", time: "14:00" },
  ]);
});

test("keeps distinct times on the same date as separate showings", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "14:00" },
      { date: "2026-11-01", time: "19:00" },
    ]),
  ).toEqual([
    { date: "2026-11-01", time: "14:00" },
    { date: "2026-11-01", time: "19:00" },
  ]);
});

test("returns an empty array for no rows", () => {
  expect(normalizeShowings([])).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/showings.test.ts`
Expected: FAIL — cannot resolve `@/lib/showings`.

- [ ] **Step 3: Write the helper**

Create `src/lib/showings.ts`:

```ts
export interface ShowingInput {
  date: string;
  time: string | null;
}

// Clean the create form's in-memory showing rows before submit: trim dates, drop
// rows with a blank date, normalize a blank time to null, and dedupe exact
// (date, time) pairs while preserving first-seen order.
export function normalizeShowings(rows: { date: string; time: string }[]): ShowingInput[] {
  const seen = new Set<string>();
  const out: ShowingInput[] = [];
  for (const row of rows) {
    const date = row.date.trim();
    if (!date) continue;
    const time = row.time.trim() || null;
    const key = `${date}|${time ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, time });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/showings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/showings.ts src/lib/showings.test.ts
git commit -m "feat: normalizeShowings helper for create-form showings"
```

---

## Task 2: API accepts `showings[]`

**Files:**
- Modify: `src/app/api/productions/route.ts`
- Test: `src/app/api/productions/route.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/productions/route.test.ts` (the file already mocks `addShowDate`/`createProduction`/etc. and defines `postReq`):

```ts
test("POST creates each provided showing with its time, in order", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(
    postReq({
      title: "Newsies",
      showings: [
        { date: "2026-11-01", time: "19:00" },
        { date: "2026-11-02", time: null },
      ],
    }),
  );
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledTimes(2);
  expect(addShowDate).toHaveBeenNthCalledWith(1, "p2", "2026-11-01", "19:00");
  expect(addShowDate).toHaveBeenNthCalledWith(2, "p2", "2026-11-02", null);
});

test("POST skips showings whose date is blank", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(
    postReq({ title: "Newsies", showings: [{ date: "", time: "19:00" }, { date: "2026-11-01" }] }),
  );
  expect(res.status).toBe(201);
  expect(addShowDate).toHaveBeenCalledTimes(1);
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null);
});

test("POST prefers showings[] over a legacy showDate when both are present", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  await POST(postReq({ title: "Newsies", showDate: "2026-12-31", showings: [{ date: "2026-11-01" }] }));
  expect(addShowDate).toHaveBeenCalledTimes(1);
  expect(addShowDate).toHaveBeenCalledWith("p2", "2026-11-01", null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/route.test.ts"`
Expected: FAIL — the new tests see `addShowDate` not called (route ignores `showings`).

- [ ] **Step 3: Update the route**

In `src/app/api/productions/route.ts`:

(a) Widen the body type (the existing object that destructures `title`, `showDate`, `notes`, `orgName`):

```ts
    const body = (await request.json()) as {
      title?: string;
      showDate?: string | null;
      showings?: { date?: string; time?: string | null }[];
      notes?: string | null;
      orgName?: string;
    };
```

(b) Replace the single-`showDate` block (currently the `if (typeof body.showDate === "string" && body.showDate.trim()) { await addShowDate(...) }`) with:

```ts
    if (Array.isArray(body.showings)) {
      for (const s of body.showings) {
        const date = typeof s?.date === "string" ? s.date.trim() : "";
        if (!date) continue;
        const time = typeof s?.time === "string" && s.time.trim() ? s.time.trim() : null;
        await addShowDate(production.id, date, time);
      }
    } else if (typeof body.showDate === "string" && body.showDate.trim()) {
      await addShowDate(production.id, body.showDate, null);
    }
```

Leave everything else (auth, `ensureOrganization`, `createProduction`, `createCast`, the 201 response, the catch) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/route.test.ts"`
Expected: PASS — the 3 new tests plus all existing ones (the legacy `showDate` test on line ~64 still passes because no `showings` is provided there).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/route.ts" "src/app/api/productions/route.test.ts"
git commit -m "feat: POST /api/productions accepts a showings[] array"
```

---

## Task 3: Create-form multi-showing UI

**Files:**
- Modify: `src/app/productions/new/page.tsx`

No automated test (no React component tests in this repo). Verified via typecheck + lint here and manual check.

- [ ] **Step 1: Replace the page with the multi-showing form**

Overwrite `src/app/productions/new/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeShowings } from "@/lib/showings";

interface ShowingRow {
  date: string;
  time: string;
}

export default function NewProductionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showings, setShowings] = useState<ShowingRow[]>([{ date: "", time: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateShowing(index: number, patch: Partial<ShowingRow>) {
    setShowings((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addRow() {
    setShowings((prev) => [...prev, { date: "", time: "" }]);
  }

  function removeRow(index: number) {
    setShowings((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/productions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, showings: normalizeShowings(showings) }),
    });
    if (res.ok) {
      router.push("/productions");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Something went wrong");
    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="font-display mb-6 text-3xl font-semibold">New Production</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-medium">Show title</span>
          <input
            className="field w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mary Poppins"
            required
          />
        </label>

        <div className="space-y-2">
          <span className="mb-1 block font-medium">Showings</span>
          {showings.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="field min-w-0 flex-1"
                value={s.date}
                onChange={(e) => updateShowing(i, { date: e.target.value })}
                aria-label="Showing date"
              />
              <input
                type="time"
                className="field w-32 shrink-0"
                value={s.time}
                onChange={(e) => updateShowing(i, { time: e.target.value })}
                aria-label="Showing time (optional)"
              />
              <button type="button" onClick={() => removeRow(i)} className="link-muted text-sm">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="btn-ghost text-sm">
            Add date
          </button>
        </div>

        {error && <p className="text-[var(--red)]">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Create production"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/productions")}
            disabled={saving}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck, lint, and run the full test suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no type errors, no NEW lint errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/productions/new/page.tsx
git commit -m "feat: multi-showing date+time entry on the create form"
```

---

## Self-Review Notes

- **Spec coverage:** `normalizeShowings` helper + tests (Task 1); API `showings[]` with `showDate` fallback (Task 2); repeatable date+time UI, optional, self-contained, submits normalized array (Task 3). No SQL migration (uses existing `addShowDate`). All spec sections map to a task.
- **Type consistency:** `normalizeShowings(rows: { date: string; time: string }[]) => ShowingInput[]` (`{date, time: string|null}`) defined in Task 1 and consumed by the form in Task 3; the API independently reads `{ date?, time? }[]` off the request body (server-side defensive parse, not the same type — intentional, since JSON over the wire is untyped).
- **Back-compat:** legacy `showDate` path retained; existing route test unchanged and still green.
- **No placeholders:** every code step has complete code; every run step has an exact command + expected result.
