# Inventory list redesign — design

**Date:** 2026-06-11
**Status:** Approved for planning
**Roadmap:** follow-on to #4 (inventory/costume-library module)

## Problem

The `/inventory` page (`InventoryManager`) renders **every** item as a full editable
card — all fields, a `PhotoStrip`, and a per-card `usage` fetch. That is fine for a
handful of items but collapses at the scale Nada actually expects: **hundreds, possibly
thousands** of stock items. Concretely:

- N full cards = N `PhotoStrip` image loads + N `/api/inventory/[id]/usage` fetches on
  page load.
- Vertical space per item makes the library impossible to scan or navigate.

Once an item exists it should only appear as a compact, searchable list row — never a
big card.

## Goal

Replace the card-per-item view with a **dense, searchable, category-grouped list**.
A row expands inline to reveal the full editor (fields + photos), and that detail
(photos/usage) loads **only when expanded**. Newly added items — from the productions
quick-add card or the inventory page — drop straight into the list as a row.

Out of scope: server-side search/pagination (revisit if a single org exceeds a few
thousand items), bulk edit, CSV import.

## Decisions (from brainstorming)

1. **Detail view: expand row inline** (option A). One page, no new routes, matches the
   app's expand-from-link theme.
2. **Grouped by category**, with **collapsible** group headers showing a count
   (`Hats · 12`). Blank-category items fall into an **"Uncategorized"** group, sorted
   last.
3. **Search spans all groups.** Typing filters by item name across every category; group
   headers remain (with match counts) and matching groups auto-open. Clearing search
   returns to the default grouped view. **Client-side** filtering over the already-loaded
   text rows.
4. **Category autocomplete.** The category field (in the expand editor and the add form)
   offers existing categories via a `<datalist>`, while still allowing a brand-new value.
   Keeps group names consistent so `Hat`/`Hats` don't split.

## Architecture

### New pure module — `src/lib/inventory-grouping.ts` (unit-tested)

All list logic lives here as pure functions so it is testable without a DOM (the repo
tests lib/data, not components):

- `filterItemsByName(items, query): InventoryRow[]` — case-insensitive substring match on
  `name`; empty/whitespace query returns all items unchanged.
- `groupItemsByCategory(items): CategoryGroup[]` — returns ordered groups
  `{ category: string | null, label: string, items: InventoryRow[] }`. Real categories
  sorted alphabetically (case-insensitive); `null`/blank collapsed into one group
  labelled `"Uncategorized"`, always last. Items within a group sorted by `name`
  (case-insensitive).
- `uniqueCategories(items): string[]` — distinct non-blank categories, sorted, for the
  datalist.

Edge cases the tests must cover: empty list; all-uncategorized; mixed case categories
(`Hats` vs `hats` group together by normalized key, display the first-seen casing);
query matching across multiple groups; query matching nothing (every group hidden).

### Components

Rewrite `src/components/InventoryManager.tsx` as the grouped-list orchestrator (keeping
the exported name so `inventory/page.tsx` is unchanged) and extract the expand editor:

- **`InventoryManager` (rewrite)** — client. Holds `items` state (so add/remove/edit
  stay in sync), `query`, `expandedId`, and a `collapsed: Set<categoryKey>`.
  - Renders: search input → datalist of categories → category group headers → rows →
    add form at the bottom (unchanged quick-add: name → `POST /api/inventory`, new item
    pushed into `items`).
  - Derives groups via `filterItemsByName` + `groupItemsByCategory` (memoized on
    `items`/`query`).
  - A collapsed group renders only its header (its rows are not in the DOM). While a
    search query is active, groups are forced open and the collapse toggle reflects the
    filtered counts.
  - Row click toggles `expandedId`. Only the expanded row mounts `InventoryItemDetail`.
- **`InventoryItemDetail` (new)** — client. The current `InventoryCard` body: editable
  fields (`category` input wired to the shared `<datalist>`), notes, `PhotoStrip`
  (`/api/inventory/[id]/images`), and the lazy `usage` fetch (now runs only when the row
  is expanded, not for every item). `PATCH`/`DELETE` logic moves here unchanged. On
  rename/category change it calls back up so the row label and grouping update; on remove
  it calls back to drop the item from `items`.

### Row contents

`name` (bold, ellipsized) · `size · ×quantity` (muted) · chevron. Category is the group
header, so it is not repeated in the row. Location/notes/photos live in the expanded
detail.

### Data flow

- `inventory/page.tsx` keeps loading all items via `listInventoryItems(orgId)` (text
  only — cheap; no images). No new endpoint. Categories for the datalist are derived
  client-side from the loaded items.
- Detail photos + usage load on expand via the existing per-item routes. Collapsing or
  collapsing-then-reopening a row re-mounts detail (acceptable; small refetch).

### Performance

Rows are text-only with zero network cost; the heavy per-item loads happen only on
expand. Collapsed groups keep their rows out of the DOM. If a single org ever pushes
many thousands of *expanded-by-default* rows and scroll feels heavy, virtualization is a
later, isolated change — not needed now.

## Testing

- **Unit (Vitest):** `inventory-grouping.test.ts` covering `filterItemsByName`,
  `groupItemsByCategory`, `uniqueCategories` across the edge cases above. TDD: write
  these first.
- **Existing coverage unchanged:** `POST/PATCH/DELETE /api/inventory` and the data layer
  are already tested; this redesign reuses them.
- **No component tests** — repo has no React test infra; verify the UI by typecheck +
  lint + running the app.

## Files

| File | Change |
|------|--------|
| `src/lib/inventory-grouping.ts` | **new** — pure grouping/filter/category helpers |
| `src/lib/inventory-grouping.test.ts` | **new** — unit tests (TDD) |
| `src/components/InventoryManager.tsx` | **rewrite** — grouped, searchable, collapsible list + add form + category datalist |
| `src/components/InventoryItemDetail.tsx` | **new** — expand-row editor (was `InventoryCard`), lazy photos/usage |
| `src/app/inventory/page.tsx` | unchanged import; verify props still map |

## Verification

`npx tsc --noEmit` clean · `npm run lint` no new errors · `npx vitest run` green
(including the new grouping tests) · run the app and confirm: list groups by category,
headers collapse, search filters across groups, a row expands to the editor with photos
loading only then, category field autocompletes, quick-add drops a new row in.
