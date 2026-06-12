# Inventory Item Peek Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "From inventory ↗" on a costume piece opens a view-only popup of that inventory item (photos + fields) over the panel, instead of navigating away.

**Architecture:** A new `GET /api/inventory/[itemId]` returns the item. A new `InventoryItemPeek` overlay (mirroring `PhotoStrip`'s `bg-black/70` lightbox) fetches and shows it read-only, with an "Open in inventory ↗" escape-hatch link. The costume panel's title-bar link becomes a button that opens the popup via a `peekItemId` state.

**Tech Stack:** Next.js 16 App Router, Clerk, Supabase data layer, TypeScript strict, Vitest, React.

---

## File Structure

| File | Change |
|------|--------|
| `src/app/api/inventory/[itemId]/route.ts` | add `GET` |
| `src/app/api/inventory/[itemId]/route.test.ts` | test the `GET` |
| `src/components/InventoryItemPeek.tsx` | **new** — view-only overlay |
| `src/components/RoleCostumePanel.tsx` | title-bar link → button + popup; drop `Link` import |

---

## Task 1: `GET /api/inventory/[itemId]` (TDD)

**Files:**
- Modify: `src/app/api/inventory/[itemId]/route.ts`
- Test: `src/app/api/inventory/[itemId]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/api/inventory/[itemId]/route.test.ts`, add `GET` to the route import:
```ts
import { GET, PATCH, DELETE } from "@/app/api/inventory/[itemId]/route";
```
Then append:
```ts
test("GET returns the item", async () => {
  vi.mocked(getInventoryItem).mockResolvedValue({
    id: "i1", org_id: "org_1", name: "Top hat", category: "Hats", size: "M",
    quantity: 2, location: "Bin A", notes: null, created_at: "",
  });
  const res = await GET(new Request("http://x"), ctx("i1"));
  expect(res.status).toBe(200);
  expect((await res.json()).item.name).toBe("Top hat");
  expect(getInventoryItem).toHaveBeenCalledWith("org_1", "i1");
});

test("GET 404 when the item is not in the org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  vi.mocked(getInventoryItem).mockRejectedValue(new NotFoundError("Inventory item not found"));
  const res = await GET(new Request("http://x"), ctx("nope"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/inventory/[itemId]/route.test.ts"`
Expected: FAIL — `GET` is not exported.

- [ ] **Step 3: Implement**

In `src/app/api/inventory/[itemId]/route.ts`, add a `GET` handler (the file already imports `getInventoryItem`, `getAuthContext`, `errorResponse`, `NextResponse`, and the `Ctx` type). Add it above the existing `PATCH`:
```ts
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { itemId } = await params;
    const item = await getInventoryItem(orgId, itemId);
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/inventory/[itemId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/inventory/[itemId]/route.ts" "src/app/api/inventory/[itemId]/route.test.ts"
git commit -m "feat: GET /api/inventory/[itemId] (single item)"
```

---

## Task 2: `InventoryItemPeek` overlay component

**Files:**
- Create: `src/components/InventoryItemPeek.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/InventoryItemPeek.tsx` with exactly:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PhotoStrip } from "@/components/PhotoStrip";

interface PeekItem {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
}

// View-only popup of an inventory item, opened from a costume piece. Mirrors
// PhotoStrip's lightbox overlay (bg-black/70, click-out + Esc to close).
export function InventoryItemPeek({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [item, setItem] = useState<PeekItem | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${itemId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { item: PeekItem }) => { if (active) setItem(d.item); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [itemId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = item ? [item.category, item.size, `×${item.quantity}`].filter(Boolean).join(" · ") : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface max-h-[85vh] w-full max-w-md overflow-y-auto p-4"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{item?.name ?? "Inventory item"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-lg leading-none text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--red)]">Couldn&apos;t load this item.</p>
        ) : !item ? (
          <p className="text-sm muted">Loading…</p>
        ) : (
          <div className="space-y-2">
            <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} readOnly />
            {meta && <p className="text-sm muted">{meta}</p>}
            {item.location && (
              <p className="text-sm">
                <span className="muted">Location:</span> {item.location}
              </p>
            )}
            {item.notes && <p className="whitespace-pre-wrap text-sm">{item.notes}</p>}
            <Link href={`/inventory?item=${item.id}`} className="link-muted inline-block text-xs">
              Open in inventory ↗
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (clean). Run: `npm run lint` (no new errors). (Not imported yet — fine.)

- [ ] **Step 3: Commit**

```bash
git add src/components/InventoryItemPeek.tsx
git commit -m "feat: InventoryItemPeek view-only overlay"
```

---

## Task 3: Open the popup from the costume panel

Replace the title-bar `From inventory ↗` link with a button that opens the popup; render the popup once per `PieceEditor` via a `peekItemId` state; drop the now-unused `Link` import.

**Files:**
- Modify: `src/components/RoleCostumePanel.tsx`

- [ ] **Step 1: Swap imports**

Replace:
```tsx
import Link from "next/link";
```
with:
```tsx
import { InventoryItemPeek } from "@/components/InventoryItemPeek";
```
(`Link` is only used by the From-inventory link being replaced; `InventoryItemPeek` replaces it.)

- [ ] **Step 2: Add `peekItemId` state to `PieceEditor`**

In the `PieceEditor` function, after:
```tsx
  const [expanded, setExpanded] = usePersistentState<Record<string, boolean>>(storageKey, {});
```
add:
```tsx
  const [peekItemId, setPeekItemId] = useState<string | null>(null);
```

- [ ] **Step 3: Replace the link with a button**

Replace:
```tsx
                {d.inventory_item_id && (
                  <Link
                    href={`/inventory?item=${d.inventory_item_id}`}
                    className="link-muted shrink-0 whitespace-nowrap text-xs"
                  >
                    From inventory ↗
                  </Link>
                )}
```
with:
```tsx
                {d.inventory_item_id && (
                  <button
                    type="button"
                    onClick={() => setPeekItemId(d.inventory_item_id)}
                    className="link-muted shrink-0 whitespace-nowrap text-xs"
                  >
                    From inventory ↗
                  </button>
                )}
```

- [ ] **Step 4: Render the popup at the end of `PieceEditor`**

Replace:
```tsx
      {onAddFromInventory && <AddFromInventory onPick={onAddFromInventory} busy={busy} />}
    </div>
  );
}
```
with:
```tsx
      {onAddFromInventory && <AddFromInventory onPick={onAddFromInventory} busy={busy} />}
      {peekItemId && <InventoryItemPeek itemId={peekItemId} onClose={() => setPeekItemId(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` (clean). Run: `npm run lint` (no new errors — no unused `Link`). Run: `npx vitest run` (green, unchanged count).

- [ ] **Step 6: Commit**

```bash
git add src/components/RoleCostumePanel.tsx
git commit -m "feat: open inventory item popup from a costume piece (no navigation)"
```

---

## Task 4: Verification

**Files:** none (Clerk-gated; interactive checks need an authenticated browser). Dev server: http://localhost:3000.

- [ ] **Step 1: Static** — `npx tsc --noEmit` clean, `npm run lint` no new errors, `npx vitest run` green.

- [ ] **Step 2: Browser** — on a role's Costume tab with an inventory-added piece:
  - Click `From inventory ↗` in the piece's title bar → a popup opens over the panel showing the item's name, read-only photos, `category · size · ×qty`, location, and notes (each only if present).
  - Closing via the `×`, clicking the backdrop, or pressing **Esc** returns you to the exact same spot (panel unchanged, no navigation).
  - `Open in inventory ↗` navigates to `/inventory` with that item expanded/scrolled (the existing deep link).
  - A piece with no linked inventory item shows no `From inventory` button.

---

## Self-Review Notes

- **Spec coverage:** GET endpoint (T1), view-only overlay with photos/fields + Open-in-inventory link + ×/backdrop/Esc close (T2), title-bar button + single popup instance (T3). ✓
- **Type consistency:** `PeekItem` shape matches the inventory item fields returned by `GET`; `{ itemId, onClose }` props consistent between `InventoryItemPeek` (T2) and its use in `PieceEditor` (T3). ✓
- **Import hygiene:** `Link` removed from `RoleCostumePanel` (only the replaced link used it); `InventoryItemPeek` added. `Link` is still used inside `InventoryItemPeek` itself for the escape-hatch link.
- **No migration / no data-layer change** (reuses `getInventoryItem`).
```
