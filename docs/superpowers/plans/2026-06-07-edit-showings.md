# Edit Showings In Place — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit an existing showing's date/time inline in the edit dialog (not just remove + re-add).

**Architecture:** Add `updateShowDate(productionId, id, patch)` to the data layer and a `PATCH /api/productions/[id]/show-dates/[dateId]` handler; turn each showing row in the edit dialog into uncontrolled date + time fields that PATCH on change.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-edit-showings-design.md`

**Conventions:** data fns throw `ValidationError`/`NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data → JSON via `errorResponse`.

---

## Task 1: `updateShowDate` data layer

**Files:**
- Modify: `src/lib/data/show-dates.ts`
- Test: `src/lib/data/show-dates-update.test.ts` (create — separate file so the existing list/insert/delete chain mock is untouched)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/show-dates-update.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError, NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqProd = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { updateShowDate } from "@/lib/data/show-dates";

beforeEach(() => {
  [maybeSingle, updSelect, eqProd, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqProd.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqProd });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("updateShowDate updates the date scoped by id and production", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_date: "2026-08-05" }, error: null });
  const row = await updateShowDate("p1", "s1", { show_date: "2026-08-05" });
  expect(from).toHaveBeenCalledWith("show_dates");
  expect(update).toHaveBeenCalledWith({ show_date: "2026-08-05" });
  expect(eqId).toHaveBeenCalledWith("id", "s1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "s1", show_date: "2026-08-05" });
});

test("updateShowDate rejects an empty date with ValidationError", async () => {
  await expect(updateShowDate("p1", "s1", { show_date: "  " })).rejects.toBeInstanceOf(ValidationError);
});

test("updateShowDate sets a provided time", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_time: "14:00:00" }, error: null });
  await updateShowDate("p1", "s1", { show_time: "14:00" });
  expect(update).toHaveBeenCalledWith({ show_time: "14:00" });
});

test("updateShowDate coerces an empty time to null", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "s1", show_time: null }, error: null });
  await updateShowDate("p1", "s1", { show_time: "" });
  expect(update).toHaveBeenCalledWith({ show_time: null });
});

test("updateShowDate throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(updateShowDate("p1", "nope", { show_date: "2026-08-05" })).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- show-dates-update`
Expected: FAIL — `updateShowDate` not exported.

- [ ] **Step 3: Implement**

In `src/lib/data/show-dates.ts`:

1. Change the errors import to include `NotFoundError`:
```typescript
import { ValidationError, NotFoundError } from "@/lib/errors";
```

2. Append `updateShowDate` (after `addShowDate`, before `deleteShowDate`):
```typescript
export async function updateShowDate(
  productionId: string,
  id: string,
  patch: { show_date?: string; show_time?: string | null },
): Promise<ShowDate> {
  const update: { show_date?: string; show_time?: string | null } = {};
  if (patch.show_date !== undefined) {
    const trimmed = patch.show_date.trim();
    if (!trimmed) throw new ValidationError("Show date is required");
    update.show_date = trimmed;
  }
  if (patch.show_time !== undefined) {
    update.show_time = patch.show_time || null;
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

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- show-dates-update`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/show-dates.ts src/lib/data/show-dates-update.test.ts
git commit -m "feat: updateShowDate data-layer function"
```

---

## Task 2: `PATCH /api/productions/[id]/show-dates/[dateId]`

**Files:**
- Modify: `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`
- Modify: `src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts`

- [ ] **Step 1: Add the PATCH handler**

In `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`:

1. Change the data import to include `updateShowDate`:
```typescript
import { deleteShowDate, updateShowDate } from "@/lib/data/show-dates";
```

2. Add this handler after the existing `DELETE`:
```typescript
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, dateId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { date?: string; time?: string };
    const patch: { show_date?: string; show_time?: string | null } = {};
    if (typeof body.date === "string") patch.show_date = body.date;
    if (typeof body.time === "string") patch.show_time = body.time;
    const showDate = await updateShowDate(id, dateId, patch);
    return NextResponse.json({ showDate });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Add tests**

In `src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts`:

1. Add an `updateShowDate` mock to the show-dates mock block:
```typescript
const deleteShowDate = vi.fn();
const updateShowDate = vi.fn();
vi.mock("@/lib/data/show-dates", () => ({
  deleteShowDate: (...a: unknown[]) => deleteShowDate(...a),
  updateShowDate: (...a: unknown[]) => updateShowDate(...a),
}));
```

2. Change the import to include `PATCH`:
```typescript
import { DELETE, PATCH } from "@/app/api/productions/[id]/show-dates/[dateId]/route";
```

3. Add `updateShowDate` to the `beforeEach` reset array (currently `[getAuthContext, assertProductionInOrg, deleteShowDate]`).

4. Append these tests (the file already has `ctx`):
```typescript
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH updates the date (200)", async () => {
  updateShowDate.mockResolvedValue({ id: "s1", show_date: "2026-08-05", show_time: null });
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ showDate: { id: "s1", show_date: "2026-08-05", show_time: null } });
  expect(updateShowDate).toHaveBeenCalledWith("p1", "s1", { show_date: "2026-08-05" });
});

test("PATCH updates the time (200)", async () => {
  updateShowDate.mockResolvedValue({ id: "s1", show_date: "2026-08-05", show_time: "14:00:00" });
  const res = await PATCH(patchReq({ time: "14:00" }), ctx("p1", "s1"));
  expect(res.status).toBe(200);
  expect(updateShowDate).toHaveBeenCalledWith("p1", "s1", { show_time: "14:00" });
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ date: "2026-08-05" }), ctx("p1", "s1"));
  expect(res.status).toBe(404);
  expect(updateShowDate).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run + tsc**

Run: `npm test -- "show-dates/[dateId]"` (or `npm test`) then `npx tsc --noEmit`
Expected: DELETE + PATCH tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/show-dates/[dateId]/route.ts" "src/app/api/productions/[id]/show-dates/[dateId]/route.test.ts"
git commit -m "feat: PATCH show-date edits date/time"
```

---

## Task 3: Edit dialog — inline-editable showing rows

**Files:**
- Modify: `src/components/EditableProductionHeader.tsx`

- [ ] **Step 1: Drop now-unused imports**

The showing rows stop rendering formatted text (they become inputs), so `formatShowDate`/`formatShowTime` are no longer used in this file. Change:
```typescript
import { formatShowDate, formatShowTime, latestDate, todayIso } from "@/lib/countdown";
```
to:
```typescript
import { latestDate, todayIso } from "@/lib/countdown";
```

- [ ] **Step 2: Add a `saveShowing` helper**

After the existing `removeDate` function, add:
```typescript
  function saveShowing(dateId: string, patch: { date?: string; time?: string }) {
    return send(
      `/api/productions/${productionId}/show-dates/${dateId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) },
      "Couldn't save showing",
    );
  }
```

- [ ] **Step 3: Replace the read-only showing rows with editable fields**

Replace the `{showDates.map((d) => ( ... ))}` block (the read-only `<span>` + Remove rows) with:
```tsx
        {showDates.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="field min-w-0 flex-1"
              defaultValue={d.show_date}
              onChange={(e) => e.target.value && saveShowing(d.id, { date: e.target.value })}
              aria-label="Showing date"
            />
            <input
              type="time"
              className="field w-32 shrink-0"
              defaultValue={(d.show_time ?? "").slice(0, 5)}
              onChange={(e) => saveShowing(d.id, { time: e.target.value })}
              aria-label="Showing time"
            />
            <button type="button" onClick={() => removeDate(d.id)} disabled={busy} className="link-muted text-sm">
              Remove
            </button>
          </div>
        ))}
```

(The `{showDates.length === 0 && <p ...>No showings yet.</p>}` line above it and the Add row below it stay unchanged.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (clean — confirms `formatShowDate`/`formatShowTime` are no longer referenced here), `npm run lint` (no new errors), `npm test` (green).

- [ ] **Step 5: Commit**

```bash
git add src/components/EditableProductionHeader.tsx
git commit -m "feat: inline-edit showing dates/times in the edit dialog"
```

---

## Task 4: Full verification pass

- [ ] **Step 1: Suite + types + lint**

Run: `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (no new errors).

- [ ] **Step 2: Manual smoke**

- Open a production → click the title → Edit dialog.
- Change an existing showing's **date** → it saves (the row may re-sort); reload confirms it persisted.
- Change an existing showing's **time** → saves; clear the time → reverts to no-time.
- Add a new showing and Remove one still work.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** `updateShowDate` (T1); PATCH route (T2); inline-editable rows + `saveShowing` (T3). All mapped.
- **Type consistency:** `updateShowDate(productionId, id, patch: { show_date?, show_time? })`; route builds the same patch shape from `{ date?, time? }`; `saveShowing(dateId, { date?, time? })` posts `{ date?, time? }`. Consistent.
- **Uncontrolled inputs:** `defaultValue` keyed by `d.id` avoids snap-back during the save round-trip and survives the post-save `router.refresh()`.
- **Unused imports removed:** `formatShowDate`/`formatShowTime` dropped from `EditableProductionHeader` (rows now use raw input values). The detail page still uses both for its read-only Showings list — unaffected.
