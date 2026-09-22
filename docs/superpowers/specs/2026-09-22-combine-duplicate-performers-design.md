# Combine duplicate performers

**Date:** 2026-09-22
**Status:** Approved design, not yet built

## Why

Before 2026-09-15, every "Add primary", "Add understudy", or ensemble add created a brand-new
performer row. A person cast in three roles became three performers with three independent
measurement sets. The ensemble-roles branch (merged 2026-09-14, deployed 2026-09-15) fixed this
going forward: the add box offers existing performers, one performer can hold many castings, and
the cast-list import creates one person per name. Nothing in the app merges the duplicates that
already exist.

Nada's "Peter and the Starcatcher" (org Evergreen Public Schools) was entered by hand on the
evening of 2026-09-13 Pacific under the old build. Census on 2026-09-22 (shared Supabase, counts
only):

| Item | Count |
|---|---|
| Performer rows | 61 |
| Names that appear more than once | 14 |
| Rows in those duplicate groups | 54 |
| Performers with measurements | 9 |
| Duplicate rows that carry measurements | 6, all primaries; their ensemble copies are blank |
| Costume designs, pieces, photos | 0 |

She measured the main-cast row of each person and expected the measurements to show under the same
person's ensemble roles. They do not, because those are different rows.

This feature lets a user combine same-name performers in a production into one person, keeping one
measurement set, so the fix is a click in the app rather than an operator running SQL.

## Scope

In:

- Detect groups of performers in one production whose names match under the import's existing
  `matchKey` normalization (case, spacing, light punctuation).
- A review screen listing every group, which row will be kept, and what each row holds.
- A one-click combine of the selected groups, transactional per group.
- A guide line.

Out:

- Fuzzy or partial name matching. Two spellings stay two people; the user renames one to match and
  the group appears.
- Cross-production or cross-org merging.
- Merging performers whose names differ but who the user says are the same person. The rename path
  covers it.
- Any change to how castings, the import, or the picker create performers.

## Data model

No new tables. One new Postgres function in migration `0036_combine_performers.sql`:

```
combine_performers(p_production_id uuid, p_keep uuid, p_drop uuid[]) returns jsonb
```

Behavior, in one transaction:

1. Verify `p_keep` and every id in `p_drop` belong to `p_production_id`; raise otherwise. Verify
   `p_keep` is not in `p_drop`.
2. For each dropped performer, `update castings set performer_id = p_keep where performer_id = drop`.
   If any update violates `castings_cast_role_performer_key` (same cast and role already hold the
   kept performer), the whole transaction raises with a stable message prefix `combine_collision`
   so the caller can map it to a user-facing reason. Costume pieces reference castings by id and
   move with them untouched.
3. `insert into performer_measurements (performer_id, measurement_key, value_numeric, value_text,
   unit, updated_at) select p_keep, ... from performer_measurements where performer_id = any(p_drop)
   on conflict (performer_id, measurement_key) do nothing`. The kept row's values always win;
   only blanks fill. When two dropped rows both hold the same key, the one with the earlier
   `updated_at` is inserted first and therefore wins among them (order the select by `updated_at`).
4. `delete from performers where id = any(p_drop)`; their remaining measurements cascade.
5. Return `jsonb_build_object('castings_moved', n, 'measurements_filled', n, 'performers_removed', n)`.

Privileges follow 0035: `revoke execute ... from public, anon, authenticated; grant execute ... to
service_role`. The function is only ever called through `supabaseAdmin`.

The one-primary-per-cast-and-role index cannot be violated by a move: two rows in a group cannot
both be primary for the same cast and role, because the group is per production and that index
already forbids it for any two performers.

## Server

### Pure module: `src/lib/performer-duplicates.ts`

No database access, so it is unit-testable and shared by the page and the route.

```ts
export interface DuplicateMember {
  performerId: string;
  name: string;              // as stored
  createdAt: string;
  filledMeasurements: number;
  castings: { castingId: string; castId: string; roleId: string; assignment: Assignment }[];
}

export interface DuplicateGroup {
  key: string;               // matchKey of the name
  keepId: string;
  members: DuplicateMember[];
  blocked: { reason: "collision"; castId: string; roleId: string } | null;
}

export function findDuplicateGroups(input: {
  performers: { id: string; label: string; created_at: string }[];
  castings: { id: string; cast_id: string; role_id: string; performer_id: string; assignment: Assignment }[];
  filledCounts: Record<string, number>;
}): DuplicateGroup[];
```

Rules:

- Group by `matchKey(label)` from `src/lib/cast-import/normalize.ts`. Groups of one are dropped.
- `keepId` is the member with the highest `filledMeasurements`; ties go to the earliest
  `created_at`, then the smallest id for determinism.
- `blocked` is set when any two members share a `(cast_id, role_id)` pair, because moving one onto
  the other would violate the castings unique key. The review shows the role and cast so the user
  can remove one casting by hand.
- Output is sorted by the kept member's name, case-insensitive, so the review is stable.

### Data module: `src/lib/data/performer-duplicates.ts`

```ts
export async function loadDuplicateGroups(productionId: string): Promise<DuplicateGroup[]>
export async function combinePerformers(productionId: string, keepId: string, dropIds: string[]): Promise<CombineCounts>
```

`loadDuplicateGroups` reads performers, castings, and `getFilledMeasurementCounts` and calls the
pure function. `combinePerformers` calls the RPC and maps a `combine_collision` error to a
`ConflictError` with the message "Same person is cast twice in one role. Remove one casting first."

### Route: `POST /api/productions/[id]/performers/combine`

Body: `{ groups: { keepId: string; dropIds: string[] }[] }`, at most 200 groups, ids must be UUIDs.

Steps:

1. `getAuthContext`, `assertProductionInOrg`.
2. Shape-check the body the way `parseApplyPayload` does. Reject on any malformed item with a
   `ValidationError` ("Invalid request. Reload and try again.").
3. Recompute `loadDuplicateGroups` from fresh data. Every requested group must match a computed
   group exactly: same `keepId`, same set of `dropIds`, and not `blocked`. A request that does not
   match is stale (someone renamed or removed a row since the review loaded) and fails with
   `ConflictError("The cast list changed. Reload and review again.")` before anything runs. This is
   what guarantees the server never merges two different names or a row from another production,
   regardless of what the client sends.
4. Run `combinePerformers` per group, sequentially, in review order. The first failure stops the
   loop; groups already combined stay combined. Return `409` with the error and the count of groups
   completed.
5. On success return `{ counts: { groups, castingsMoved, measurementsFilled, performersRemoved },
   workspace: await loadWorkspaceSnapshot(id) }`, reusing the cast-import snapshot loader so the
   workspace can replace its state in one go, exactly as `applyImport` does.

Any-member access matches the rest of the workspace; no admin gate, because combining is a repair
of data any member can already create and delete row by row.

## Client

### Detection and entry point

`src/app/(app)/productions/[id]/page.tsx` already loads performers, castings, and filled counts. It
calls `findDuplicateGroups` and passes `duplicateGroups` to `ProductionWorkspace`.

In `ProductionWorkspace`, next to the existing "Import cast list" link (line 357 area), when
`duplicateGroups.length > 0`:

> 14 names appear more than once. [Combine duplicates]

Singular form for one name. The link opens the review panel in the same slot the import panel
uses. The two panels never show at once.

The workspace recomputes `duplicateGroups` client-side after any change it already tracks
(rename, add, remove, import) using the same pure function, with `filledMeasurements` taken from
the server-provided `measurementStatus` as 0, 1, or 2 (none, partial, complete) since exact counts
are not on the client. Ranking within a group therefore may differ from the server's until reload;
the review states "Which copy is kept is confirmed when you combine", and the server's recompute in
step 3 is the authority. Simpler alternative rejected: reloading the page after every edit.

### Review panel: `src/components/CombineDuplicatesPanel.tsx`

Modeled on `CastImportReview`. One card per group:

- Header: the name, and a checkbox (default on, disabled and off when `blocked`).
- One line per member: roles held (role name, cast name when the production has more than one
  cast, assignment tag via `assignmentShortTag`), measurement status word (none, partial,
  complete), and a "Kept" badge on the keeper.
- For a blocked group, a muted line: "Cast twice as {role} in {cast}. Remove one casting first."

Footer: "Combine selected ({n})" primary button, "Cancel" link. While busy, everything is disabled.

On success: call `onCombined(workspace, counts)`, which replaces casts, roles, performers, castings
state and sets the note "Combined {groups} names; {measurementsFilled} measurements carried over."
using the workspace's existing note slot. On a 409, show the server message inside the panel and
leave it open; the panel re-fetches nothing, the user reloads.

### Guide

Under "Performers and measurements" in `src/app/(app)/guide/page.tsx`:

> If the same person was added under several roles as separate entries, the cast list offers
> **Combine duplicates**. It keeps one entry per name, moves every role onto it, and carries the
> measurements over, so you only take them once.

## Error handling

| Situation | Behavior |
|---|---|
| Client sends ids from another production or a different name | Recompute mismatch, 409, nothing changed |
| Review is stale (row renamed or removed since load) | 409 "The cast list changed. Reload and review again." |
| Group would collide on cast and role | Never sent (blocked in UI); if sent anyway, 409 from the recompute |
| RPC raises `combine_collision` (race between recompute and run) | 409 with the conflict message; earlier groups stay combined |
| Body malformed | 400 ValidationError |
| Production not in org | 404 via `assertProductionInOrg` |

## Testing

Vitest, following the repo's mock patterns:

- `performer-duplicates.test.ts` (pure): grouping by normalized name; singleton groups dropped;
  keeper by filled count, then created_at, then id; blocked detection on a shared cast and role;
  stable sort.
- `data/performer-duplicates.test.ts`: RPC argument shape; `combine_collision` maps to
  `ConflictError`; other errors rethrown.
- `api/.../combine/route.test.ts`: 404 outside the org; 400 on malformed body; 409 when a requested
  group is not in the recompute (wrong keeper, extra id, blocked group); sequential run stops at the
  first failure and reports completed count; success returns counts and the snapshot.
- `CombineDuplicatesPanel.test.tsx`: renders groups, blocked group unchecked and disabled, submit
  sends only checked groups.

Migration verification, per the home CLAUDE.md: confirm the function and its grants through
`pg_proc` and `has_function_privilege` under `set role postgres`, not `information_schema`.

Browser pass after implementation: seed a local production shaped like Nada's (one name as primary
plus two ensemble castings, measured only on the primary), run the combine, confirm one performer
with three castings and the measurements present on every role's link.

## Rollout

- No data backfill. Nada runs "Combine duplicates" once on her production after deploy.
- The empty second "Peter and the Starcatcher" created in her org on 2026-09-22 is hers to keep or
  delete; this feature does not touch it.
