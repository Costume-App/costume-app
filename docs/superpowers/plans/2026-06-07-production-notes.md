# Production Notes On Detail Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimizable, auto-saving production notes textarea to the detail page (below Showings, above the casts).

**Architecture:** `setProductionNotes` data fn + a `notes` branch on the existing `PATCH /api/productions/[id]`; a `ProductionNotes` client component that's collapsed-when-empty / expanded-when-present and auto-saves on blur. The `productions.notes` column already exists.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-production-notes-design.md`

**Conventions:** data fns throw `NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data → JSON via `errorResponse`.

---

## Task 1: `setProductionNotes` data layer

**Files:**
- Modify: `src/lib/data/productions.ts`
- Test: `src/lib/data/productions-set-notes.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/productions-set-notes.test.ts`:

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

import { setProductionNotes } from "@/lib/data/productions";

beforeEach(() => {
  [maybeSingle, updSelect, eqOrg, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqOrg.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqOrg });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setProductionNotes updates notes scoped by id and org", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", notes: "call at 6" }, error: null });
  const row = await setProductionNotes("org_1", "p1", "call at 6");
  expect(from).toHaveBeenCalledWith("productions");
  expect(update).toHaveBeenCalledWith({ notes: "call at 6" });
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
  expect(row).toEqual({ id: "p1", notes: "call at 6" });
});

test("setProductionNotes stores null for an empty string", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "p1", notes: null }, error: null });
  await setProductionNotes("org_1", "p1", "");
  expect(update).toHaveBeenCalledWith({ notes: null });
});

test("setProductionNotes throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setProductionNotes("org_1", "nope", "x")).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- productions-set-notes`
Expected: FAIL — `setProductionNotes` not exported.

- [ ] **Step 3: Implement**

In `src/lib/data/productions.ts`, append after `setProductionActive` (`NotFoundError` is already imported):

```typescript
export async function setProductionNotes(orgId: string, id: string, notes: string): Promise<Production> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .update({ notes: notes || null })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Production not found");
  return data as Production;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- productions-set-notes`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/productions-set-notes.test.ts
git commit -m "feat: setProductionNotes data-layer function"
```

---

## Task 2: `PATCH /api/productions/[id]` — notes branch

**Files:**
- Modify: `src/app/api/productions/[id]/route.ts`
- Modify: `src/app/api/productions/[id]/route.test.ts`

- [ ] **Step 1: Add the notes branch**

In `src/app/api/productions/[id]/route.ts`:

1. Change the data import to add `setProductionNotes`:
```typescript
import { deleteProduction, updateProduction, setProductionActive, setProductionNotes } from "@/lib/data/productions";
```

2. In `PATCH`, widen the body type and add the `notes` branch after the `isActive` branch (before the `title` fallback):
```typescript
    const body = (await request.json()) as { title?: string; isActive?: boolean; notes?: string };
    if (typeof body.isActive === "boolean") {
      const production = await setProductionActive(orgId, id, body.isActive);
      return NextResponse.json({ production });
    }
    if (typeof body.notes === "string") {
      const production = await setProductionNotes(orgId, id, body.notes);
      return NextResponse.json({ production });
    }
    const production = await updateProduction(orgId, id, typeof body.title === "string" ? body.title : "");
    return NextResponse.json({ production });
```

- [ ] **Step 2: Add tests**

In `src/app/api/productions/[id]/route.test.ts`:

1. Add a `setProductionNotes` mock to the productions mock block:
```typescript
const deleteProduction = vi.fn();
const updateProduction = vi.fn();
const setProductionActive = vi.fn();
const setProductionNotes = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  deleteProduction: (...a: unknown[]) => deleteProduction(...a),
  updateProduction: (...a: unknown[]) => updateProduction(...a),
  setProductionActive: (...a: unknown[]) => setProductionActive(...a),
  setProductionNotes: (...a: unknown[]) => setProductionNotes(...a),
}));
```

2. Add `setProductionNotes` to the `beforeEach` reset array.

3. Append (reuses the existing `patchReq` and `ctx` helpers):
```typescript
test("PATCH with notes saves via setProductionNotes (200)", async () => {
  setProductionNotes.mockResolvedValue({ id: "p1", notes: "strike set Sun" });
  const res = await PATCH(patchReq({ notes: "strike set Sun" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ production: { id: "p1", notes: "strike set Sun" } });
  expect(setProductionNotes).toHaveBeenCalledWith("org_1", "p1", "strike set Sun");
  expect(updateProduction).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run + tsc**

Run: `npm test -- "productions/[id]/route"` (or `npm test`) then `npx tsc --noEmit`
Expected: notes + existing title/isActive/DELETE tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/route.ts" "src/app/api/productions/[id]/route.test.ts"
git commit -m "feat: PATCH /api/productions/[id] saves notes"
```

---

## Task 3: `ProductionNotes` component + detail page wiring

**Files:**
- Create: `src/components/ProductionNotes.tsx`
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/ProductionNotes.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";

export function ProductionNotes({ productionId, notes }: { productionId: string; notes: string | null }) {
  const [open, setOpen] = useState(!!notes);
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(notes ?? "");

  async function save() {
    if (value === lastSaved.current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ notes: value }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save notes");
      setBusy(false);
      return;
    }
    lastSaved.current = value;
    setBusy(false);
    setSaved(true);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        ▸ Production notes
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(false)} className="link-muted text-sm">
          ▾ Production notes
        </button>
        {busy ? (
          <span className="text-xs muted">Saving…</span>
        ) : error ? (
          <span className="text-xs text-[var(--red)]">{error}</span>
        ) : saved ? (
          <span className="text-xs muted">Saved</span>
        ) : null}
      </div>
      <textarea
        className="field w-full"
        rows={4}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        placeholder="Notes for this production…"
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `src/app/productions/[id]/page.tsx`**

1. Add the import after the `ShowingsList` import:
```typescript
import { ProductionNotes } from "@/components/ProductionNotes";
```

2. Insert the notes block immediately AFTER the Showings block (the `{showDates.length > 0 && (...)}` div) and BEFORE `<ProductionWorkspace`:
```tsx
      <div className="mb-6">
        <ProductionNotes productionId={id} notes={production.notes} />
      </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npm test` (green).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductionNotes.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: production notes textarea on the detail page"
```

---

## Task 4: Full verification pass

- [ ] **Step 1: Suite + types + lint**

Run: `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (no new errors).

- [ ] **Step 2: Manual smoke**

- Open a production with no notes → "▸ Production notes" is collapsed; click to expand, type, click away → "Saved"; reload → notes persist and the section is expanded.
- Clear the textarea + blur → saves empty (null); reload → collapsed again.
- Notes area sits below the Showings list and above the casts.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** `setProductionNotes` (T1); PATCH notes branch (T2); `ProductionNotes` component + placement below Showings / above casts (T3). All mapped.
- **Type consistency:** `setProductionNotes(orgId, id, notes: string)`; PATCH body `{ title?, isActive?, notes? }`; component PATCHes `{ notes }`. Consistent.
- **`notes || null`:** empty textarea clears to null; non-empty (incl. newlines) stored verbatim.
- **No `router.refresh()`** in the component — nothing else renders notes, so the textarea stays stable; `lastSaved` ref skips no-op saves.
