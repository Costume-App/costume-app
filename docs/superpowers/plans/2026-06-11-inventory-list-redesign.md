# Inventory List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inventory page's card-per-item view with a dense, category-grouped, searchable list whose rows expand inline to the full editor, so it scales to hundreds/thousands of items.

**Architecture:** A pure, unit-tested module (`inventory-grouping.ts`) owns filtering/grouping/category logic. `InventoryManager` is rewritten as the grouped-list orchestrator (search box, collapsible category headers, compact rows, quick-add form, shared category `<datalist>`). The expanded editor — fields + `PhotoStrip` + lazy `usage` fetch — moves into a new `InventoryItemDetail` that mounts **only when a row is expanded**, so per-item photo/usage loads no longer fire for the whole list on page load.

**Tech Stack:** Next.js 16 (App Router), React client components, TypeScript (strict), Vitest, Tailwind 4, existing `/api/inventory` routes.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/inventory-grouping.ts` | **new** — `InventoryRow`/`CategoryGroup` types + pure `filterItemsByName`, `groupItemsByCategory`, `uniqueCategories` |
| `src/lib/inventory-grouping.test.ts` | **new** — Vitest unit tests for the above |
| `src/components/InventoryItemDetail.tsx` | **new** — expanded-row editor (was `InventoryCard`); lazy `usage` + `PhotoStrip`; PATCH/DELETE |
| `src/components/InventoryManager.tsx` | **rewrite** — search + grouped collapsible list + quick-add + datalist |
| `src/app/inventory/page.tsx` | unchanged; verify `initialItems` mapping still typechecks |

The exported component name `InventoryManager` is preserved so `inventory/page.tsx` needs no edit.

---

## Task 1: Pure grouping/filter module (TDD)

**Files:**
- Create: `src/lib/inventory-grouping.ts`
- Test: `src/lib/inventory-grouping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/inventory-grouping.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  filterItemsByName,
  groupItemsByCategory,
  uniqueCategories,
  type InventoryRow,
} from "@/lib/inventory-grouping";

function row(partial: Partial<InventoryRow> & { id: string; name: string }): InventoryRow {
  return {
    category: null,
    size: null,
    quantity: 1,
    location: null,
    notes: null,
    ...partial,
  };
}

const ITEMS: InventoryRow[] = [
  row({ id: "1", name: "Top hat", category: "Hats" }),
  row({ id: "2", name: "Bowler", category: "hats" }), // different casing, same group
  row({ id: "3", name: "Gloves, white", category: "Hands" }),
  row({ id: "4", name: "Mystery prop" }), // no category
  row({ id: "5", name: "Apron", category: "  " }), // blank -> uncategorized
];

test("filterItemsByName: empty query returns all items unchanged", () => {
  expect(filterItemsByName(ITEMS, "")).toBe(ITEMS);
  expect(filterItemsByName(ITEMS, "   ")).toBe(ITEMS);
});

test("filterItemsByName: case-insensitive substring match on name", () => {
  const result = filterItemsByName(ITEMS, "hat");
  expect(result.map((i) => i.id)).toEqual(["1"]); // "Top hat" matches; "Hats" category does not
});

test("filterItemsByName: no matches returns empty array", () => {
  expect(filterItemsByName(ITEMS, "zzz")).toEqual([]);
});

test("groupItemsByCategory: groups by normalized category, uncategorized last", () => {
  const groups = groupItemsByCategory(ITEMS);
  expect(groups.map((g) => g.label)).toEqual(["Hands", "Hats", "Uncategorized"]);
  expect(groups.map((g) => g.key)).toEqual(["hands", "hats", ""]);
});

test("groupItemsByCategory: merges mixed-casing categories under first-seen label", () => {
  const hats = groupItemsByCategory(ITEMS).find((g) => g.key === "hats")!;
  expect(hats.label).toBe("Hats"); // first-seen casing
  expect(hats.items.map((i) => i.name)).toEqual(["Bowler", "Top hat"]); // sorted by name
});

test("groupItemsByCategory: blank and null categories share the Uncategorized group", () => {
  const uncat = groupItemsByCategory(ITEMS).find((g) => g.key === "")!;
  expect(uncat.items.map((i) => i.id).sort()).toEqual(["4", "5"]);
});

test("groupItemsByCategory: empty input returns empty array", () => {
  expect(groupItemsByCategory([])).toEqual([]);
});

test("uniqueCategories: distinct non-blank categories, sorted, first-seen casing", () => {
  expect(uniqueCategories(ITEMS)).toEqual(["Hands", "Hats"]);
});

test("uniqueCategories: empty when all uncategorized", () => {
  expect(uniqueCategories([row({ id: "x", name: "x" })])).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/inventory-grouping.test.ts`
Expected: FAIL — `Cannot find module '@/lib/inventory-grouping'` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/inventory-grouping.ts`:

```ts
export interface InventoryRow {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
}

export interface CategoryGroup {
  /** Normalized key used for collapse state; "" for uncategorized. */
  key: string;
  /** Display label: first-seen casing of the category, or "Uncategorized". */
  label: string;
  items: InventoryRow[];
}

const UNCATEGORIZED_KEY = "";
const UNCATEGORIZED_LABEL = "Uncategorized";

const byNameCI = (a: InventoryRow, b: InventoryRow) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const normalizeCategory = (category: string | null): string =>
  (category ?? "").trim().toLowerCase();

export function filterItemsByName(items: InventoryRow[], query: string): InventoryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

export function groupItemsByCategory(items: InventoryRow[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const item of items) {
    const key = normalizeCategory(item.category);
    let group = groups.get(key);
    if (!group) {
      const label = key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : (item.category ?? "").trim();
      group = { key, label, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.key === UNCATEGORIZED_KEY) return 1;
    if (b.key === UNCATEGORIZED_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  for (const group of ordered) group.items.sort(byNameCI);
  return ordered;
}

export function uniqueCategories(items: InventoryRow[]): string[] {
  const seen = new Map<string, string>(); // normalized -> first-seen display
  for (const item of items) {
    const display = (item.category ?? "").trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (!seen.has(key)) seen.set(key, display);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/inventory-grouping.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory-grouping.ts src/lib/inventory-grouping.test.ts
git commit -m "feat: pure inventory grouping/filter/category helpers"
```

---

## Task 2: InventoryItemDetail (expanded-row editor)

Extracts today's `InventoryCard` body into a standalone component that mounts only when a row is expanded. The category field is wired to a shared datalist (id constant lives here and is reused by `InventoryManager`). PATCH calls also notify the parent via `onChange` so the row label and grouping update live.

**Files:**
- Create: `src/components/InventoryItemDetail.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/InventoryItemDetail.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PhotoStrip } from "@/components/PhotoStrip";
import type { InventoryRow } from "@/lib/inventory-grouping";

/** Shared <datalist> id; InventoryManager renders the matching <datalist>. */
export const CATEGORY_DATALIST_ID = "inventory-categories";

export function InventoryItemDetail({
  item,
  busy,
  onChange,
  onRemove,
}: {
  item: InventoryRow;
  busy: boolean;
  onChange: (patch: Partial<InventoryRow>) => void;
  onRemove: () => void;
}) {
  const [usage, setUsage] = useState<{ productionName: string; roleName: string }[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/inventory/${item.id}/usage`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { usage: [] }))
      .then((d) => { if (active) setUsage(d.usage ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [item.id]);

  async function patch(body: Partial<InventoryRow>) {
    onChange(body);
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  }

  return (
    <div className="surface !shadow-none space-y-2 p-3">
      <input
        className="field w-full font-medium"
        defaultValue={item.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && patch({ name: e.target.value })}
        aria-label="Item name"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className="field" list={CATEGORY_DATALIST_ID} defaultValue={item.category ?? ""} placeholder="Category"
          onBlur={(e) => e.target.value !== (item.category ?? "") && patch({ category: e.target.value.trim() || null })} aria-label="Category" />
        <input className="field" defaultValue={item.size ?? ""} placeholder="Size"
          onBlur={(e) => e.target.value !== (item.size ?? "") && patch({ size: e.target.value.trim() || null })} aria-label="Size" />
        <input className="field" type="number" min={0} defaultValue={item.quantity} placeholder="Qty"
          onBlur={(e) => Number(e.target.value) !== item.quantity && patch({ quantity: Number(e.target.value) })} aria-label="Quantity" />
        <input className="field" defaultValue={item.location ?? ""} placeholder="Location"
          onBlur={(e) => e.target.value !== (item.location ?? "") && patch({ location: e.target.value.trim() || null })} aria-label="Location" />
      </div>
      <textarea className="field w-full text-sm" rows={2} defaultValue={item.notes ?? ""} placeholder="Notes (optional)"
        onBlur={(e) => e.target.value !== (item.notes ?? "") && patch({ notes: e.target.value.trim() || null })} aria-label="Notes" />
      <PhotoStrip endpoint={`/api/inventory/${item.id}/images`} max={6} label="Photos" />
      {usage.length > 0 && (
        <p className="text-xs muted">
          Used in: {usage.map((u) => `${u.productionName} → ${u.roleName}`).join(", ")}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onRemove} disabled={busy}
          className="text-sm text-[var(--red)] hover:underline disabled:opacity-50">
          Remove item
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (The component is not yet imported anywhere; that is fine.)

- [ ] **Step 3: Commit**

```bash
git add src/components/InventoryItemDetail.tsx
git commit -m "feat: InventoryItemDetail expand-row editor (lazy photos/usage)"
```

---

## Task 3: Rewrite InventoryManager as grouped searchable list

Replaces the card list with: a search box, a shared category `<datalist>`, collapsible category group headers, compact one-line rows that expand to `InventoryItemDetail`, and the existing quick-add form. The `InventoryRow` type now comes from `inventory-grouping.ts`.

**Files:**
- Modify (full rewrite): `src/components/InventoryManager.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/InventoryManager.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  filterItemsByName,
  groupItemsByCategory,
  uniqueCategories,
  type InventoryRow,
} from "@/lib/inventory-grouping";
import { CATEGORY_DATALIST_ID, InventoryItemDetail } from "@/components/InventoryItemDetail";

export type { InventoryRow };

export function InventoryManager({ initialItems }: { initialItems: InventoryRow[] }) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searching = query.trim().length > 0;
  const groups = useMemo(() => groupItemsByCategory(filterItemsByName(items, query)), [items, query]);
  const categories = useMemo(() => uniqueCategories(items), [items]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const { item } = (await res.json()) as { item: InventoryRow };
      setItems((prev) => [...prev, item]);
      setNewName("");
      setAdding(false);
      setExpandedId(item.id);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add item");
    }
    setBusy(false);
  }

  function updateItem(id: string, patch: Partial<InventoryRow>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function remove(id: string) {
    if (!confirm("Remove this item? Pieces already pulled from it stay, but lose the link.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setExpandedId((cur) => (cur === id ? null : cur));
    } else {
      setError("Couldn't remove item");
    }
    setBusy(false);
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input
        className="field w-full"
        placeholder="Search inventory…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search inventory"
      />
      <datalist id={CATEGORY_DATALIST_ID}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {items.length === 0 && <p className="text-sm muted">No items yet. Add your on-hand stock below.</p>}
      {items.length > 0 && groups.length === 0 && (
        <p className="text-sm muted">No items match “{query.trim()}”.</p>
      )}

      {groups.map((group) => {
        const isCollapsed = !searching && collapsed.has(group.key);
        return (
          <div key={group.key} className="space-y-1.5">
            <button
              type="button"
              onClick={() => toggleCollapse(group.key)}
              disabled={searching}
              className="flex w-full items-center gap-2 border-b border-[var(--field-line)] pb-1.5 text-left disabled:cursor-default"
            >
              <span className="lbl">{group.label}</span>
              <span className="text-xs muted">
                · {group.items.length}
                {searching ? (group.items.length === 1 ? " match" : " matches") : ""}
              </span>
              {!searching && <span className="ml-auto text-sm muted">{isCollapsed ? "›" : "⌄"}</span>}
            </button>
            {!isCollapsed && (
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                      className="surface !shadow-none flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-[var(--bg)]"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs muted">
                        {[item.size, `×${item.quantity}`].filter(Boolean).join(" · ")}
                      </span>
                      <span className="shrink-0 text-sm muted">{expandedId === item.id ? "⌄" : "›"}</span>
                    </button>
                    {expandedId === item.id && (
                      <div className="mt-1.5">
                        <InventoryItemDetail
                          item={item}
                          busy={busy}
                          onChange={(patch) => updateItem(item.id, patch)}
                          onRemove={() => remove(item.id)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {adding ? (
        <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
          <input
            autoFocus
            className="field min-w-0 flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name (e.g. Top hat)"
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">Add item</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(""); }} className="link-muted shrink-0 text-sm">
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="link-muted text-sm">
          + add item
        </button>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the whole project typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (`inventory/page.tsx` builds its `initialItems` array inline; the new `InventoryRow` shape is structurally identical, so the mapping still typechecks.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `InventoryManager.tsx`, `InventoryItemDetail.tsx`, or `inventory-grouping.ts` (pre-existing `_t`/`_cols` test warnings are unrelated).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 9 new grouping tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/InventoryManager.tsx
git commit -m "feat: grouped, searchable, collapsible inventory list with inline row expand"
```

---

## Task 4: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the app and confirm behavior**

The dev server runs on http://localhost:3000. Sign in, open `/inventory`, and confirm:
- Items render as compact rows grouped under category headers (`Hats · 12`), with "Uncategorized" last.
- Tapping a header collapses/expands that group; the toggle is disabled while a search query is present.
- Typing in the search box filters by name across all groups; headers show match counts; clearing search restores the grouped view.
- Clicking a row expands it to the editor; photos and "Used in" load only on expand (not for every row on page load — confirm via the Network tab: no `usage`/image requests fire until a row is opened).
- The category field offers existing categories as you type (datalist).
- `+ add item` adds a new row that appears in the list (Uncategorized) and auto-expands.

- [ ] **Step 2: Confirm the productions quick-add still works**

Open `/productions`, use the inventory card's `+ Add to inventory`, then visit `/inventory` and confirm the new item is present as a row.

---

## Self-Review Notes

- **Spec coverage:** inline expand (Task 3), grouped + collapsible (Task 3 + Task 1 grouping), search-spans-all (Task 3 `searching` flag + Task 1 filter), category autocomplete (datalist in Tasks 2 & 3 + `uniqueCategories` in Task 1), lazy detail load (Task 2 mounts only on expand). ✓
- **Type consistency:** `InventoryRow` defined once in `inventory-grouping.ts`, re-exported from `InventoryManager`; `CATEGORY_DATALIST_ID` defined in `InventoryItemDetail`, imported by `InventoryManager`; `CategoryGroup.key`/`.label`/`.items` used consistently. ✓
- **Known minor behavior:** changing an item's category while expanded moves its row to a new group and remounts the editor (usage refetches); acceptable and noted in the spec.
