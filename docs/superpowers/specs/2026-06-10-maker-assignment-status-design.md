# Maker Assignment + Status — Design

**Date:** 2026-06-10
**Status:** Approved

## Summary

Let each "make" costume piece be assigned to a **maker** (the person sewing it),
each maker shown in their own color, with a **done** status: green = made,
red = assigned-but-not-made (outstanding), neutral = unassigned. Surfaced on both
the Tailor's-summary "To make" worklist and the role Costume tab. Backlog item #2
([[roadmap-nada-feedback-2026-06-10]]).

## Decisions (from brainstorming)

- **Makers roster:** **org-level** (one reusable list per school/org), managed on
  a small `/makers` page. Reuses the cast-color palette for swatches.
- **Status:** reuse the existing `made` flag — green (made), red (assigned & not
  made), neutral (unassigned). No separate status field.
- **Placement:** **both** the Tailor's-summary worklist (`MakePieceRow`) **and**
  the role Costume tab make-rows (`RoleCostumePanel`).
- **Consequence:** the Costume tab make-rows currently have no `made` toggle (only
  a source selector); this adds a `made` toggle there too, writing the same
  `costume_pieces.made` field, so both surfaces stay in sync.

## Data model — migration `0013`

(Next sequential migration; confirm number at build time.)

```sql
-- Org-level roster of people who make costumes (the "makers"/sewists).
create table if not exists makers (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  name       text not null,
  color      text not null default 'slate',
  created_at timestamptz not null default now()
);
create index if not exists makers_org_id_idx on makers(org_id);

-- Which maker is assigned to make a given piece.
alter table costume_pieces add column if not exists maker_id uuid references makers(id) on delete set null;
```

(Confirm `organizations` PK column name — it is `clerk_org_id` per migration 0001 — and the `color` default to match `casts.color`'s default token.) **Apply to prod on deploy.**

## Makers roster

- **Data layer** `src/lib/data/makers.ts`: `listMakers(orgId)`, `createMaker(orgId,
  {name, color})`, `updateMaker(orgId, id, {name?, color?})`, `deleteMaker(orgId,
  id)`. Org-scoped on every query (mirrors the org-scoping pattern used elsewhere).
  `Maker` interface `{ id, org_id, name, color, created_at }`.
- **API** `src/app/api/makers/route.ts` (GET list, POST create) and
  `src/app/api/makers/[makerId]/route.ts` (PATCH, DELETE). Auth via
  `getAuthContext()`; `ensureOrganization(orgId, …)` on create as the productions
  route does. Validation: non-empty name → else `ValidationError`.
- **Page** `src/app/makers/page.tsx` (org-level) — list makers with name + color
  swatch, add/edit/remove (reusing the `ColorSwatches`/`CAST_COLORS` UX from the
  cast editor). Linked from the productions list header (e.g. a "Makers" link).

## Assignment + status

- **Persistence:** extend the existing pieces upsert — `upsertPieceSource` (in
  `src/lib/data/costume-pieces.ts`) and the `PUT /api/productions/[id]/pieces`
  route — to accept an optional `makerId` (string | null) and write
  `costume_pieces.maker_id`. The `CostumePiece` type, plus the tailor-summary
  `MakeItem`/`PieceRow` shapes, gain `maker_id`. No new endpoint.
- **Shared UI** `src/components/MakeAssignment.tsx` — presentational controls for a
  make-piece: a maker `<select>` (options from the org roster, rendered with the
  maker's color dot) + a `made` toggle, plus the status color (green/red/neutral
  per the rule above). Props: `{ makers, makerId, made, busy, onChangeMaker,
  onToggleMade }`. Persistence stays in each parent.
- **Tailor's summary** (`MakePieceRow` / `MakeWorklist` / `TailorSummary`): render
  `MakeAssignment` per make row; `onChangeMaker`/`onToggleMade` save through the
  existing pieces PUT (the row already sends `made`; add `makerId`). The summary
  page loads `listMakers(orgId)` and threads it down.
- **Costume tab** (`RoleCostumePanel`): for rows whose source is `make`, render
  `MakeAssignment`; add a `setMaker`/made-toggle save that calls the pieces PUT
  preserving existing fields (mirroring the existing `setSource`). The production
  detail page loads `listMakers(orgId)` and threads it through
  `ProductionWorkspace` → `RoleCard` → `RoleCostumePanel`.

## Status color rule (shared helper)

A tiny pure helper (e.g. in `src/lib/maker-status.ts`):
`makeStatus(made: boolean, makerId: string | null) => "done" | "outstanding" |
"unassigned"` → `done` if made; else `outstanding` if a maker is assigned; else
`unassigned`. Mapped to green / red / neutral in the UI. Unit-tested.

## Testing

- `src/lib/data/makers.test.ts` — CRUD with the chained-`supabaseAdmin` mock.
- `src/app/api/makers/route.test.ts` (+ `[makerId]/route.test.ts`) — auth, list,
  create (validation), patch, delete.
- `src/lib/maker-status.test.ts` — the three-way status helper.
- Pieces PUT: extend `…/pieces/route.test.ts` to assert `makerId` is passed
  through to `upsertPieceSource`; extend the `costume-pieces` upsert test for the
  `maker_id` column.
- `MakeAssignment` / page / panel wiring — `tsc` + lint + manual.

## Affected / New Files

- New: `supabase/migrations/0013_makers.sql`
- New: `src/lib/data/makers.ts` (+ test)
- New: `src/lib/maker-status.ts` (+ test)
- New: `src/app/api/makers/route.ts` (+ test), `src/app/api/makers/[makerId]/route.ts` (+ test)
- New: `src/app/makers/page.tsx` (+ a `MakersManager` client component)
- New: `src/components/MakeAssignment.tsx`
- Modified: `src/lib/data/costume-pieces.ts` (maker_id in upsert + `CostumePiece`)
- Modified: `src/app/api/productions/[id]/pieces/route.ts` (accept `makerId`)
- Modified: `src/lib/tailor-summary.ts` (`maker_id` on `MakeItem`/`PieceRow`)
- Modified: `src/components/MakePieceRow.tsx`, `MakeWorklist.tsx`, `TailorSummary.tsx` (summary wiring)
- Modified: `src/components/RoleCostumePanel.tsx`, `RoleCard.tsx`, `ProductionWorkspace.tsx` (costume-tab wiring)
- Modified: `src/app/productions/[id]/page.tsx`, `src/app/productions/[id]/summary/page.tsx` (load makers)
- Modified: productions list page (link to `/makers`)

## Out of Scope

- Makers as Clerk users / logins (makers are just roster entries).
- Notifications to makers (that's backlog item #3, deadlines/reminders).
- Per-maker workload summaries/dashboards.
