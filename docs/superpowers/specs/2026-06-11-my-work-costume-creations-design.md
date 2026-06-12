# My Work = per-production Costume Creations, filtered to the user — design

**Date:** 2026-06-11
**Status:** Approved for planning

## Problem

`/my-work` shows a slim list of the logged-in user's assigned pieces with a done toggle.
The user wants it to show **all the same information as the Costume Creations page**
(`TailorSummary`: costumes-due banner, To-make worklist with fabric fields / measurements /
maker / done, and the Fabric list), but **filtered to their own pieces**, across every
production they have make-work in.

## Goal

Render My Work as a **section per production** the user's maker has make-pieces in. Each
section shows the full `TailorSummary` view filtered to that user's pieces, under a heading
that links to the production's detail page.

Out of scope: changing Costume Creations' own behavior; new per-piece editing beyond what
`TailorSummary` already offers; migrations.

## Decisions (from brainstorming)

1. **Structure:** one section per production (not a single combined view).
2. **Filter:** only items whose piece row has `maker_id === <user's maker>` (excludes
   lazy/no-maker make items).
3. **Section title** links to `/productions/[id]`.
4. **Maker dropdown** stays visible on the rows (faithful to "same info"; reassigning hands
   the piece off and drops it from your list).

## Architecture

### 1. Maker filter in `buildMakeWorklist` — `src/lib/tailor-summary.ts`

Add an optional last argument:
`buildMakeWorklist(roles, designs, castings, performers, casts, pieces, opts?: { makerId?: string })`.
When `opts.makerId` is set, an item is included only if a piece row exists for that
(design, casting) **and** its `maker_id === opts.makerId`. (Lazy defaults — no row, hence no
maker — are excluded.) Garments/roles with zero resulting items are omitted, as today. The
fabric purchase list and the to-make counts already derive from the worklist items, so they
filter automatically.

### 2. `TailorSummary` — `filterMakerId?` prop

Add `filterMakerId?: string`. Pass it into `buildMakeWorklist(..., { makerId: filterMakerId })`.
Unset (Costume Creations) → unchanged whole-production behavior. The `Tabs`, counts,
`CostumesDueSummary`, `MakeWorklist`, and `FabricPurchaseList` all consume the (now possibly
filtered) `worklist`, so no other changes are needed.

### 3. Shared data loader — `src/lib/data/costume-creations.ts` (new)

Extract the per-production assembly currently inline in the summary page into:
`loadCostumeCreationsData(orgId, production)` → returns the object of `TailorSummary` props
(`roles`, `designs`, `castings`, `performers` (mapping `label`→`name`), `casts`,
`initialPieces`, `photosByRole` (signed), `measurementsByCasting`, `makers`,
`costumesDueDate`). Loads exactly what the summary page loads today.

- **Costume Creations page** (`productions/[id]/summary/page.tsx`) is refactored to call this
  helper and spread the result into `<TailorSummary>` — **no behavior change**.
- This keeps the assembly in one place so My Work can reuse it per production.

### 4. My Work page — `src/app/(app)/my-work/page.tsx` (rewrite)

Server component:
- `getAuthContext` → `findMakerByUser(orgId, userId)`.
  - **No linked maker:** the existing friendly "not linked" empty state.
- Determine the productions the maker has make-work in: `listAssignmentsForMaker(orgId, maker.id)`
  → distinct `{ productionId, productionTitle }` (preserving its production-title sort).
  - **None:** "Nothing assigned to you yet."
- For each production: `assertProductionInOrg(orgId, productionId)` → `loadCostumeCreationsData`
  → render a `<section>`:
  - `<Link href={`/productions/${productionId}`}>` heading with the production title.
  - `<TailorSummary filterMakerId={maker.id} {...data} />`.

Keep the page `<main className="mx-auto max-w-2xl p-6">` + the "My Work" heading.

### 5. Cleanup

- **Remove** `src/components/MyWorkList.tsx` (replaced by the per-production sections).
- **Keep** `listAssignmentsForMaker` / `buildMakerAssignments` — now used to find the user's
  productions.
- The lightweight `setPieceMade` + `PATCH /api/pieces/[pieceId]` were only used by
  `MyWorkList`; they become unused. **Retain** them (tested, reusable) — saving on My Work
  now goes through `MakePieceRow`'s existing `PUT /api/productions/[id]/pieces`.

## Data flow

`findMakerByUser` + `listAssignmentsForMaker` give the maker and their productions. Per
production, `loadCostumeCreationsData` returns the same props the summary page uses;
`TailorSummary` filters them by `maker.id`. Saving a piece on My Work uses the same
`PUT /api/productions/[id]/pieces` path as Costume Creations (the worklist updates in place;
a piece reassigned away from the user drops out of the filtered view on its next save).

## Files

| File | Change |
|------|--------|
| `src/lib/tailor-summary.ts` | `buildMakeWorklist` optional `{ makerId }` filter |
| `src/lib/tailor-summary.test.ts` | tests for the maker filter |
| `src/components/TailorSummary.tsx` | `filterMakerId?` prop → builder |
| `src/lib/data/costume-creations.ts` | **new** — `loadCostumeCreationsData(orgId, production)` |
| `src/app/(app)/productions/[id]/summary/page.tsx` | use the shared loader (no behavior change) |
| `src/app/(app)/my-work/page.tsx` | **rewrite** — per-production filtered sections + title links |
| `src/components/MyWorkList.tsx` | **remove** |

## Testing

- **TDD (`tailor-summary.test.ts`):** `buildMakeWorklist` with `{ makerId }` includes only
  that maker's pieces; excludes other makers' pieces and lazy/no-maker items; omits empty
  garments; counts (`totalItems`/`madeItems`) reflect the filter.
- **No component tests** (repo convention). Verify the page, the shared loader refactor, and
  the section links via `tsc` + `lint` + authenticated browser.

## Risks / caveats

- **Load cost:** a maker in N productions triggers N full summary-data loads. Fine at this
  scale; if it ever grows, the loader can be slimmed to only the maker's roles. Not now.
- **Refactor risk:** extracting the loader must preserve the summary page's exact output —
  covered by the "no behavior change" requirement and a browser check of Costume Creations.
- The per-row maker dropdown remains on My Work by design (reassigning hands off the piece).
