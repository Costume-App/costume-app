# Ensemble Roles & Performer Reuse — Design

**Date:** 2026-09-14
**Status:** Approved by Chris (brainstorming session)
**Branch:** `feat/ensemble-roles` (stacked on `feat/cast-list-sort`, which adds `src/lib/role-sort.ts`)

## Goal

1. Let a role be marked **ensemble**: no primary and no understudies — just a list of
   performers who each need a costume.
2. Let an **existing performer** be cast into another role (or ensemble) so their
   measurements are reused instead of re-entered per role.

## Decisions made

- **Reuse scope:** within the same production only. Performers stay production-scoped
  (`performers.production_id`); no org-level roster.
- **Ensemble & casts:** ensemble lists are **per cast**, like regular roles. The same
  performer can be picked into any cast's roles/ensemble via the reuse picker. No
  "copy ensemble from another cast" button.
- **Removal (×):** unassigns the performer from that one role in that cast. If it was
  their **last** casting anywhere in the production, the performer and their
  measurements are deleted too (confirm text says so). No orphaned performers.
- **Toggling ensemble with people already cast:** convert, don't block.
  Regular → ensemble: every casting for the role (all casts) becomes `ensemble`.
  Ensemble → regular: per cast, the earliest-created casting becomes `primary`, the
  rest `understudy`. Castings keep their ids, so costume pieces and measurements survive.
- **Approach:** `roles.is_ensemble` flag + a third casting assignment value `ensemble`
  (Approach A). Rejected: storing ensemble members as `understudy` (leaks "u/s" labels
  everywhere) and a separate ensemble-members table (costume_pieces reference
  `casting_id`, so it would duplicate the costume model).

## Current state (verified)

- `castings` unique `(cast_id, role_id, performer_id)`; partial unique index
  `castings_one_primary_per_cast_role` on `(cast_id, role_id) where assignment = 'primary'`.
  The schema already permits one performer in many roles/casts.
- `addCastMember` (`src/lib/data/castings.ts`) always creates a new performer.
- Removing a cast member calls `DELETE /api/performers/[performerId]`, which deletes the
  performer, all their castings (cascade), and measurements.
- `RoleCostumePanel` lists only `primary` + `understudy` castings — ensemble castings
  would silently vanish without a change.
- The performer measurement page shows only the performer's first casting.
- `costume_pieces.casting_id` → a performer in two roles gets separate pieces per role
  (correct) and one shared set of measurements.

## Data layer

### Migration `supabase/migrations/0030_ensemble_roles.sql`

- `alter table roles add column if not exists is_ensemble boolean not null default false;`
- Replace the `castings.assignment` check constraint to allow
  `('primary', 'understudy', 'ensemble')`: `drop constraint if exists castings_assignment_check`
  (Postgres's auto-name for the inline check in 0003) and re-add it under the same name.
- `create or replace function set_role_ensemble(p_role_id uuid, p_is_ensemble boolean)
  returns void` — one transaction:
  - update `roles.is_ensemble`;
  - if true: `update castings set assignment = 'ensemble' where role_id = p_role_id`;
  - if false: first set all the role's castings to `understudy`, then, per `cast_id`,
    set the earliest (`created_at`, then `id`) to `primary`.
- Purely additive/backward-compatible: safe to apply to the shared Supabase before deploy.
  Chris applies it manually; nothing is pushed or applied without his green light.

### `src/lib/data/roles.ts`

- `Role` gains `is_ensemble: boolean`.
- `createRole({ productionId, name, isEnsemble? })` inserts `is_ensemble`.
- New `setRoleEnsemble(productionId, roleId, isEnsemble)` → verifies the role is in the
  production, calls `supabaseAdmin.rpc("set_role_ensemble", …)`, returns the updated role.
- `insertRoleCopy` gains `isEnsemble` and `production-copy.ts` passes `role.is_ensemble`.

### `src/lib/data/castings.ts`

- `Assignment = "primary" | "understudy" | "ensemble"`.
- `addCastMember` accepts **either** `name` (create a new performer, as today, with the
  existing rollback) **or** `performerId` (must belong to the production; no performer
  created, no rollback). Validation:
  - assignment must match the role type: ensemble roles accept only `ensemble`; regular
    roles accept only `primary`/`understudy`;
  - 23505 on the primary index → "This role already has a primary for this cast.";
  - 23505 on `castings_cast_role_performer_key` → "That performer is already in this role
    for this cast."
- New `removeCasting(productionId, castingId)` → deletes the casting; if the performer
  has no remaining castings, deletes the performer (measurements cascade). Returns
  `{ performerDeleted: boolean }`.

### Pure helpers (new `src/lib/performer-picker.ts`)

- `performerRoleSummaries(performers, castings, roles, casts)` →
  `Record<performerId, string>` like `"Tevye (Cast A), Ensemble (Cast B)"`.
- `pickerCandidates(query, performers, castings, { castId, roleId })` → performers in the
  production whose name contains the query (case-insensitive), excluding anyone already
  cast in this role for this cast; sorted by name.
- `isLastCasting(performerId, castingId, castings)` for the confirm copy.

## API

- `POST /api/productions/[id]/roles` — body gains optional `isEnsemble: boolean`.
- `PATCH /api/productions/[id]/roles/[roleId]` — body `{ isEnsemble: boolean }` →
  `setRoleEnsemble`; response `{ role }`. The client refetches castings after a toggle
  (assignments change server-side) via a new `GET /api/productions/[id]/castings` returning
  `{ castings }` (none exists today).
- `POST /api/productions/[id]/castings` — body gains optional `performerId`; `assignment`
  accepts `ensemble`. When `performerId` is given, `name` is ignored and the response's
  `performer` is the existing one.
- New `DELETE /api/productions/[id]/castings/[castingId]` → `assertProductionInOrg`,
  `assertCastingInProduction`, `removeCasting`; response `{ ok: true, performerDeleted }`.
- `DELETE /api/performers/[performerId]` stays (unused by the cast panel afterwards).

## UI

### Workspace / role creation (`ProductionWorkspace.tsx`)

- `Role` type gains `isEnsemble`; page maps `r.is_ensemble`.
- "Add role" form gets an **Ensemble** checkbox; sends `isEnsemble`.

### Role card (`RoleCard.tsx`)

- Collapsed row summary: ensemble roles show `Ensemble · N` (N = castings for the selected
  cast) instead of the primary's name. Measurement dot aggregate already covers all
  castings for the role/cast.

### Cast & Measure tab (`RoleCastPanel.tsx`)

- Top: **Ensemble role** toggle (checkbox). When people are cast in any cast, `confirm()`
  with the count, e.g. "3 cast members will become ensemble members." /
  "The first-added member in each cast becomes primary; the rest become understudies."
  On success: update role in `setRoles`, refetch castings into `setCastings`.
- Regular role: unchanged Primary + Understudies layout.
- Ensemble role: single **Ensemble** list (added order) with **+ Add performer**; each row
  is the existing `CastLink` (dot, measurements link, rename, ×), no numbering.
- **Picker** replaces `AddName` for primary / understudy / ensemble: text input with a
  dropdown of `pickerCandidates` showing `Name — role summary`, then a final
  **+ Add new "<typed>"** option. Enter/submit on the input = add new (never silently
  reuses). Choosing an existing performer posts `performerId`; the new casting is
  appended and the performer is not re-added to `performers`.
- **×** calls the casting DELETE. Confirm copy:
  - other castings remain → "Remove Amy from Tevye?"
  - last casting → "Remove Amy? This is their only role, so their measurements will be
    deleted too."
  On success remove the casting; if `performerDeleted`, also drop from `performers`.

### Costume tab (`RoleCostumePanel.tsx`)

- `ordered` = primary, then understudies, then ensemble members (created order). No
  "· Understudy" label on ensemble members.

### Summaries (`tailor-summary.ts`, `TailorSummary.tsx`, `MakePieceRow.tsx`, `costume-creations.ts`)

- Widen assignment types to include `ensemble`. `MakePieceRow` label: `· ens` for
  ensemble (as `· u/s` for understudy). No logic change — ensemble castings already flow
  through as performers needing pieces (fabric estimate and cost roll-up included).

### Performer measurement page

- Header lists every casting: role name + cast name (+ "Understudy"/"Ensemble" tag), one
  per line or comma-joined; falls back to "Measurements" when none.

### Sort (`role-sort.ts`)

- No code change needed: ensemble roles have no primary, so under "Performer A–Z" they sort
  with unassigned roles (by character name). Add a test asserting this.

### Guide

- Roles section: one sentence on ensemble roles and on reusing an existing performer.

## Out of scope

- Copy ensemble from another cast; org-level performer roster; AI role suggestions
  producing ensemble roles; reordering ensemble members.

## Testing

TDD with the repo's Vitest mock patterns (see existing `castings.test.ts`,
`route.test.ts` files).

- Data: `addCastMember` by `performerId` vs `name`; assignment/role-type mismatch
  rejected; duplicate-in-role message; performer from another production rejected;
  `removeCasting` last vs not-last; `setRoleEnsemble` calls the RPC with the right args;
  `createRole`/`insertRoleCopy` pass `is_ensemble`.
- API: castings POST with `performerId`; castings GET; castings DELETE (org + production
  checks); role POST/PATCH with `isEnsemble`.
- Helpers: `performerRoleSummaries`, `pickerCandidates`, `isLastCasting`; role-sort
  ensemble case; tailor-summary passes `ensemble` through.
- Finish: `npx tsc --noEmit`, full `npx vitest run`, eslint on touched files; Playwright
  pass if a local Clerk session is available, otherwise ask Chris for a localhost check.
