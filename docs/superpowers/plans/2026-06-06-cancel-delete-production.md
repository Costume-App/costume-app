# Cancel & Delete a Production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user back out of a production — a Cancel button on the new-production form, and a type-to-confirm Delete on an existing production.

**Architecture:** Add a `deleteProduction` data-layer function (unit-tested with vitest) and a thin `DELETE /api/productions/[id]` route mirroring existing delete routes. Add a `.btn-ghost` Cancel button to the new-production form (pure navigation, no API). Add a `DeleteProductionButton` client component that expands inline and requires typing `delete` before calling the DELETE route and redirecting to `/productions`.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (`supabaseAdmin`), Clerk (`getAuthContext`), Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-cancel-delete-production-design.md`

---

## File Structure

- **Create** `src/lib/data/productions-delete.test.ts` — vitest unit test for `deleteProduction` (separate file so the existing `productions.test.ts` mock wiring stays untouched).
- **Modify** `src/lib/data/productions.ts` — add `deleteProduction(orgId, productionId)`.
- **Create** `src/app/api/productions/[id]/route.ts` — `DELETE` handler (this file does not exist yet; the `[id]` dir only has sub-resource routes).
- **Modify** `src/app/productions/new/page.tsx` — add Cancel button.
- **Create** `src/components/DeleteProductionButton.tsx` — type-to-confirm expander (client component).
- **Modify** `src/app/productions/[id]/page.tsx` — render `DeleteProductionButton` in the header.

**Design note (deviation from spec wording):** The spec said `deleteProduction` would itself call `assertProductionInOrg`. To match the existing pattern (`deleteRole`/`deleteCast` are pure deletes; the *route* does the assert), the route calls `assertProductionInOrg` and `deleteProduction` is a pure scoped delete (`.eq("id").eq("org_id")` for defense-in-depth). Same end behavior, consistent with the codebase.

---

## Task 1: Data layer — `deleteProduction`

**Files:**
- Test: `src/lib/data/productions-delete.test.ts` (create)
- Modify: `src/lib/data/productions.ts` (append function)

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/productions-delete.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";

const eqOrg = vi.fn();
const eqId = vi.fn(() => ({ eq: eqOrg }));
const del = vi.fn(() => ({ eq: eqId }));
const from = vi.fn(() => ({ delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { deleteProduction } from "@/lib/data/productions";

beforeEach(() => {
  [eqOrg, eqId, del, from].forEach((m) => m.mockReset());
  eqId.mockReturnValue({ eq: eqOrg });
  del.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ delete: del });
});

test("deleteProduction deletes the row scoped by id and org", async () => {
  eqOrg.mockResolvedValue({ error: null });
  await deleteProduction("org_1", "p1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(eqId).toHaveBeenCalledWith("id", "p1");
  expect(eqOrg).toHaveBeenCalledWith("org_id", "org_1");
});

test("deleteProduction throws on supabase error", async () => {
  eqOrg.mockResolvedValue({ error: { message: "delete failed" } });
  await expect(deleteProduction("org_1", "p1")).rejects.toThrow("delete failed");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- productions-delete`
Expected: FAIL — `deleteProduction is not a function` / no export named `deleteProduction`.

- [ ] **Step 3: Add the implementation**

Append to `src/lib/data/productions.ts` (after `createProduction`, end of file):

```typescript
export async function deleteProduction(orgId: string, productionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("productions")
    .delete()
    .eq("id", productionId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- productions-delete`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/productions-delete.test.ts
git commit -m "feat: deleteProduction data-layer function"
```

---

## Task 2: API route — `DELETE /api/productions/[id]`

**Files:**
- Create: `src/app/api/productions/[id]/route.ts`

This mirrors `src/app/api/productions/[id]/roles/[roleId]/route.ts` exactly (auth → assert-in-org → delete → `{ ok: true }`). No unit test — the codebase has no route-handler tests; verify manually in Task 5.

- [ ] **Step 1: Create the route file**

Create `src/app/api/productions/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteProduction } from "@/lib/data/productions";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    await deleteProduction(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Type-check / build the route**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/productions/[id]/route.ts"
git commit -m "feat: DELETE /api/productions/[id] route"
```

---

## Task 3: Cancel button on the new-production form

**Files:**
- Modify: `src/app/productions/new/page.tsx`

- [ ] **Step 1: Replace the single submit button with a Cancel + submit row**

In `src/app/productions/new/page.tsx`, replace this block (currently lines 57–59):

```tsx
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "Saving…" : "Create production"}
        </button>
```

with:

```tsx
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/productions")}
            disabled={saving}
            className="btn-ghost flex-1"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Create production"}
          </button>
        </div>
```

(`router` is already imported and initialized at the top of the file — no new imports needed.)

- [ ] **Step 2: Verify it renders and navigates**

Run: `npm run dev`, open `http://localhost:3000/productions/new`, type a title, click **Cancel**.
Expected: returns to `/productions`; no new production appears in the list.

- [ ] **Step 3: Commit**

```bash
git add "src/app/productions/new/page.tsx"
git commit -m "feat: Cancel button on new-production form"
```

---

## Task 4: Delete UI — `DeleteProductionButton` + wire into production page

**Files:**
- Create: `src/components/DeleteProductionButton.tsx`
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Create the client component**

Create `src/components/DeleteProductionButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProductionButton({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "delete";

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      router.push("/productions");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "Couldn't delete production");
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        Delete production
      </button>
    );
  }

  return (
    <div className="surface mt-4 space-y-3 p-4">
      <p className="text-sm">
        Deleting removes this production <strong>and all its cast, roles, castings, costume
        designs, and pieces</strong>. This can&apos;t be undone.
      </p>
      <label className="block">
        <span className="lbl mb-1 block">
          Type <code>delete</code> to confirm
        </span>
        <input
          className="field w-full"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="delete"
          autoFocus
        />
      </label>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete || busy}
          className="btn-primary"
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
          disabled={busy}
          className="link-muted text-sm"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Import the component in the production page**

In `src/app/productions/[id]/page.tsx`, add this import after the existing `ProductionWorkspace` import (currently line 15):

```tsx
import { DeleteProductionButton } from "@/components/DeleteProductionButton";
```

- [ ] **Step 3: Render it in the header row**

In `src/app/productions/[id]/page.tsx`, replace the back-link line (currently line 56–58):

```tsx
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
```

with a justify-between row that keeps the back link on the left and the delete affordance on the right:

```tsx
      <div className="flex items-center justify-between">
        <Link href="/productions" className="link-muted text-sm">
          ← Productions
        </Link>
        <DeleteProductionButton productionId={id} />
      </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open an existing production at `/productions/[id]`.
Expected:
- "Delete production" link shows top-right of the header.
- Clicking it expands the warning + text input; "Delete permanently" is **disabled**.
- Typing `delete` enables the button; "Never mind" collapses and clears it.
- Clicking "Delete permanently" removes the production and lands on `/productions`; the production and its children are gone.

- [ ] **Step 6: Commit**

```bash
git add "src/components/DeleteProductionButton.tsx" "src/app/productions/[id]/page.tsx"
git commit -m "feat: type-to-confirm delete on production page"
```

---

## Task 5: Full verification pass

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (including the new `productions-delete` tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: End-to-end manual check**

- New-production form → Cancel → no record created.
- Create a production → delete it via type-to-confirm → redirected to list, production gone.
- Delete failure path (optional: temporarily point fetch at a bad id) shows an inline error and does not redirect.

> Do NOT push or deploy — Chris gives the green light for that separately.
```
