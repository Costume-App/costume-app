# Tailor's Summary — Design Spec

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan
**Roadmap ref:** `roadmap-make-summary` (memory)

## Goal

Give the tailor (Nada) an actionable, production-wide view off the production
detail page: an **items-to-make worklist** with per-piece **fabric details** and
**made/complete** tracking, plus an aggregated **fabric purchase list**.

## Decisions (from brainstorming)

- **Tailor's notes** = an items-to-make **worklist** (not a free-text field).
- **Fabric** is structured and attached **per performer/piece** (`costume_pieces`),
  not per garment — yardage/size can differ by performer.
- **Fabric fields:** type, color/colorway, width, supplier, yardage estimate,
  estimated unit cost. All nullable.
- **Made tracking:** a `made` boolean per piece — the worklist is a checklist.
- **Scope:** the summary spans the **whole production (all casts)**.
- **Editing happens on this page** (edit-in-place), not back in the per-role panel.

## Key constraint: the lazy-default piece model

`costume_pieces` uses a **lazy default**. A `(design, casting)` cell is implicitly
`source = "make"` unless a row explicitly records `on_hand` / `shared` (or a
`make` with a `source_note`). `upsertPieceSource` currently **deletes** a row when
it reverts to `make` with no note (`costume-pieces.ts:63`).

The pieces we attach fabric + made-status to are exactly the `make` pieces — which
usually have **no row**. So the model must:

1. **Materialize** a row on first fabric/made edit (the upsert already inserts).
2. **Stop deleting** rows that carry fabric data or `made = true`. A row is deleted
   only when fully empty: `source = make` AND no note AND no fabric fields AND
   `made = false`.

## The make-set

The worklist is computed as: enumerate `designs × castings` across **all casts**
(primary + understudy), then **exclude** any cell whose stored source is `on_hand`
or `shared`. Everything remaining is a "to make" item. On-hand and shared pieces
never appear — they are not being made.

- A `costume_design` belongs to a role (`role_id`); it applies to every casting of
  that role, in any cast.
- Absence of a piece row ⇒ `make` ⇒ included.

## Data model — migration `0011_costume_fabric.sql`

Add to `costume_pieces`:

| Column             | Type          | Notes                                   |
|--------------------|---------------|-----------------------------------------|
| `fabric_type`      | `text`        | nullable, free text                     |
| `fabric_color`     | `text`        | nullable, free text                     |
| `fabric_width`     | `text`        | nullable, free text (e.g. `45"/60"`)    |
| `fabric_supplier`  | `text`        | nullable, free text                     |
| `fabric_yardage`   | `numeric`     | nullable, per-unit yards                |
| `fabric_unit_cost` | `numeric`     | nullable, **price per yard**            |
| `made`             | `boolean`     | `not null default false`                |
| `made_at`          | `timestamptz` | nullable; set when `made` flips to true |

Cost math: a piece's line cost = `fabric_yardage × fabric_unit_cost`.

## Data layer changes — `src/lib/data/costume-pieces.ts`

- Extend `CostumePiece` interface with the new columns.
- Extend `upsertPieceSource` input with optional fabric fields + `made`.
  - Write fabric fields + `made` into the upsert payload.
  - `made_at`: set to now when transitioning false→true; null when set back to false.
  - **Revised delete rule:** delete the row only when
    `source === "make" && !note && no fabric fields set && made === false`.
    Otherwise upsert/keep the row.
- New read helper (or extend existing): `listCostumePieces` already returns all
  columns via `select("*")`, so it covers the new fields automatically.

## API — extend `PUT /api/productions/[id]/pieces`

The existing `PUT` (source upsert) is extended to also accept the fabric fields and
`made`. `source` remains required (the worklist passes `source: "make"` for make
items). Auth + IDOR guards unchanged (`assertProductionInOrg`,
`assertCastingInProduction`, design-in-production check).

Request body adds (all optional):
`fabricType?, fabricColor?, fabricWidth?, fabricSupplier?, fabricYardage?, fabricUnitCost?, made?`

Validation: numeric fields must parse to a number ≥ 0 or be null/blank; `made`
must be boolean. Strings trimmed; blank ⇒ null.

## Page & components

### Route
`src/app/productions/[id]/summary/page.tsx` — server component.
- Auth via `assertProductionInOrg`; `notFound()` on `NotFoundError`.
- Loads roles, casts, castings, performers, designs, pieces (same loaders as the
  detail page).
- `← Back` link to `/productions/[id]`.
- Renders a client `<TailorSummary>` with the loaded data + a `Tabs` switcher.

### Entry point
A right-aligned `Tailor's summary →` link on the same row as the Production Notes
toggle (`src/app/productions/[id]/page.tsx:106`). Wrap the existing
`<ProductionNotes>` row in a flex row with the link aligned right.

### `TailorSummary` (client) — two tabs (reuse `Tabs`)

**Tab 1 — "To make"** (the worklist / tailor's notes)
- Grouped **Role → Garment (design) → performers**.
- Header progress: *"7 of 18 made."*
- Each role shows its existing costume notes (read-only) as context.
- Each performer row: performer name + **made checkbox** (checked ⇒ row strikes
  through + greys); expands to edit the 6 fabric fields.
- Fabric fields + made save **on blur / on toggle**, same save pattern as the
  notes panels (local state, `lastSaved` ref, `inFlight` guard, PUT, propagate
  saved value to parent state so remounts don't revert — mirrors the role-notes
  fix from this session).

**Tab 2 — "Fabric list"** (the fabric summary)
- Aggregates every make-piece **with fabric specified**, grouped by
  `type + color + width + supplier`. Sums yardage; est. cost = Σ(yardage × unit
  cost). Shows per-line: type, color, width, total yardage, supplier, est. cost.
- Grand total yardage + cost.
- Make-pieces **missing fabric** listed under **"Fabric not specified yet"** so
  Nada sees what's still blank.

## Pure helpers (testable)

Put aggregation/derivation in `src/lib/` pure functions (repo's only test style):

- `buildMakeWorklist(designs, castings, pieces)` → grouped make-items with resolved
  fabric/made per `(design, casting)`, honoring the lazy default + on-hand/shared
  exclusion.
- `buildFabricPurchaseList(makeItems)` → `{ lines: FabricLine[], unspecified:
  MakeItem[], totals }` with grouping + cost math.

## Testing (vitest)

- Make-set: lazy default included; on-hand/shared excluded; all-casts coverage;
  understudies included.
- Fabric aggregation: grouping key, yardage sum, cost math, unspecified bucket,
  grand totals.
- Delete rule: row persists when it carries fabric or `made=true`; deleted only
  when fully empty.
- API: PUT accepts + validates fabric/made; rejects bad numerics; auth/IDOR
  guards intact (extend existing `route.test.ts`).

## Assumptions

- Summary spans all casts.
- `made` is a single boolean (no separate "verified" state).
- `fabric_unit_cost` is **per yard**; line total = yardage × unit cost.
- `fabric_width` is free text.

## Out of scope (this pass)

- Per-piece body dimensions beyond the existing per-performer measurements.
- Fabric inventory / what's already owned.
- Export / print view (can follow once Nada confirms the layout).
