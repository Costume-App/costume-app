# Connect makers to users + "My Work" — design

**Date:** 2026-06-11
**Status:** Approved for planning
**Builds on:** the organization area (Clerk org switcher + members). Foundation for roadmap #3c (email reminders).

## Problem

`makers` are an app-level roster (`{ id, org_id, name, color }`) assigned to costume
pieces, with **no connection to actual users**. There's no way for a logged-in member who
is also a maker to see *their* assigned pieces, and (later) no way to email a maker their
to-make list because we don't know their account/email.

## Goal

Optionally link a maker to a Clerk org member, while keeping free-add makers (freelancers
with no account) working exactly as now. Use the link to power a personal **"My Work"**
page (the pieces assigned to the logged-in user's maker) and a pull-based
member→maker sync. Email reminders (#3c) are a later spec built on this link.

Out of scope: email reminders (#3c), Clerk webhook auto-create, per-piece permissions.

## Decisions (from brainstorming)

1. **Link is optional**, nullable; free-add unchanged. One user ↔ at most one maker per
   org; one maker ↔ at most one user.
2. **Link purposes:** "My Work" view (now), email reminders (later #3c), and pull-based
   "add member as maker" sync (now, replacing webhook auto-create).
3. **"My Work"** lives at a **dedicated `/my-work` page** with a nav link, grouped by
   production, with a done toggle.
4. **Permissions:** managing makers/links stays open to any org member (consistent with
   today). Linking records identity only; it grants/removes nothing.

## Architecture

### 1. Migration `0019_makers_user_link.sql`

```sql
alter table makers add column clerk_user_id text;
create unique index makers_org_user_unique
  on makers (org_id, clerk_user_id)
  where clerk_user_id is not null;
```

Nullable column; partial unique index enforces one maker per user per org. Shared
Supabase — apply 0019 like prior migrations.

### 2. Data layer — `src/lib/data/makers.ts`

- Add `clerk_user_id: string | null` to the `Maker` interface.
- `createMaker(orgId, { name, color?, clerkUserId? })` — sets `clerk_user_id` when given
  (used by "add member as maker").
- `updateMaker(orgId, id, patch)` — `patch.clerkUserId?: string | null` links (string) or
  unlinks (`null`); absent leaves it untouched (follow the existing
  `!== undefined` convention).
- `findMakerByUser(orgId, userId): Promise<Maker | null>` — the maker linked to a user, or
  null.

### 3. Data layer — assignments (`src/lib/data/maker-assignments.ts`, new)

`listAssignmentsForMaker(orgId, makerId): Promise<MakerAssignment[]>` where
`MakerAssignment = { pieceId, productionId, productionTitle, roleName, performerName, made, made_at }`.
Joins `costume_pieces` (filtered `maker_id = makerId`) up through
`costume_design → role` and `costume_design → production` (scoped to `org_id`) and
`casting → performer`. Returns rows sorted by production title then role name. Org scoping
is enforced through the production's `org_id` so a maker id from another org yields
nothing.

### 4. Piece "done" toggle — new lightweight endpoint

The existing `PUT /api/productions/[id]/pieces` is a full upsert (needs
`designId`/`castingId`/`source` + all fields) — too heavy for a single toggle. Add:

- `setPieceMade(orgId, pieceId, made): Promise<void>` (`src/lib/data/costume-pieces.ts`):
  asserts the piece's production belongs to `orgId` (join `piece → costume_design →
  production.org_id`; throw `NotFoundError` otherwise), then updates `made` and
  `made_at` (`made ? now : null`).
- `PATCH /api/pieces/[pieceId]` (`src/app/api/pieces/[pieceId]/route.ts`): body
  `{ made: boolean }` → `setPieceMade`. Validates `made` is boolean; auth via
  `getAuthContext`.

### 5. Org members API — `GET /api/org/members` (`src/app/api/org/members/route.ts`)

Returns the active org's Clerk members for the link UI:
`{ members: [{ userId, name, email, imageUrl }] }`, via
`clerkClient().organizations.getOrganizationMembershipList({ organizationId: orgId })`,
mapping each membership's `publicUserData` (name from first/last/identifier, email from
`identifier`, `imageUrl`). Auth via `getAuthContext`.

### 6. Linking UI — `src/components/MakersManager.tsx` (+ small additions)

- On mount, fetch `GET /api/org/members` (credentials include) into state.
- **Per maker row:** a "Link to member" control — a `<select>` of members; choosing one
  PATCHes `/api/makers/{id}` `{ clerkUserId }`; a linked row shows a subtle "● member"
  badge (member name) and an **Unlink** action (PATCH `{ clerkUserId: null }`). Existing
  name/color editing is unchanged.
- **"Team members not yet makers"** section: members whose `userId` isn't linked to any
  maker, each with **"Add as maker"** → `POST /api/makers` `{ name: memberName, clerkUserId }`,
  pushing the new linked maker into the list.
- The makers API routes (`/api/makers` POST, `/api/makers/[id]` PATCH) accept the optional
  `clerkUserId` (string | null) and pass it through to the data layer.

### 7. "My Work" page — `src/app/my-work/page.tsx` + nav link

- Add a **"My Work"** `<Link href="/my-work">` in the productions header, beside Inventory.
- Server page: `getAuthContext` → `findMakerByUser(orgId, userId)`.
  - **No linked maker:** friendly empty state ("You're not linked to a maker yet — ask an
    admin, or link yourself from Makers").
  - **Linked:** `listAssignmentsForMaker` → render grouped by production, each row
    `Role → Performer — (piece)` with a **done** checkbox. A client component
    (`MyWorkList`) toggles via `PATCH /api/pieces/{pieceId}` `{ made }` and updates local
    state.

### 8. Data flow / scoping

All queries scope by the active `orgId` from `getAuthContext` (Clerk active org), matching
the rest of the app. The link stores only a `clerk_user_id` string; member names/emails are
resolved live from Clerk (never duplicated into our DB).

## Files

| File | Change |
|------|--------|
| `supabase/migrations/0019_makers_user_link.sql` | **new** — `clerk_user_id` + partial unique index |
| `src/lib/data/makers.ts` | add `clerk_user_id`; create/update accept `clerkUserId`; `findMakerByUser` |
| `src/lib/data/maker-assignments.ts` | **new** — `listAssignmentsForMaker` |
| `src/lib/data/costume-pieces.ts` | add `setPieceMade` |
| `src/app/api/pieces/[pieceId]/route.ts` | **new** — `PATCH { made }` |
| `src/app/api/org/members/route.ts` | **new** — `GET` org members from Clerk |
| `src/app/api/makers/route.ts` | POST accepts `clerkUserId` |
| `src/app/api/makers/[id]/route.ts` | PATCH accepts `clerkUserId` (string\|null) |
| `src/components/MakersManager.tsx` | member fetch, per-row link/unlink, "not yet makers" section |
| `src/components/MyWorkList.tsx` | **new** — client list with done toggle |
| `src/app/my-work/page.tsx` | **new** — My Work page |
| `src/app/productions/page.tsx` | add "My Work" nav link |

## Testing

TDD the pure/data units with the repo's `supabaseAdmin` mock patterns:
- `makers`: create/update set & clear `clerk_user_id` (and absent leaves untouched);
  `findMakerByUser` returns the match / null.
- `maker-assignments`: `listAssignmentsForMaker` shapes joined rows correctly and is
  org-scoped (foreign org → empty).
- `setPieceMade`: sets `made`/`made_at`; rejects a piece outside the org.
- `PATCH /api/pieces/[pieceId]` and `GET /api/org/members`: route tests with mocked data
  layer / Clerk client (follow `src/app/api/**/route.test.ts` patterns).

No component tests (repo has none). Verify UI via `tsc` + `lint` + authenticated browser:
link/unlink a member, "add as maker", and the My Work page listing + done toggle.

## Risks / caveats

- **Migration 0019** must be applied to the shared Supabase project before the linked
  features work; additive and nullable, so deployed code is unaffected until then.
- **Clerk membership list** may paginate for large orgs; for the expected small staff size
  a single page (default limit) is fine — if an org ever exceeds it, add pagination
  (flagged, not built).
- A maker linked to a user who later leaves the org becomes a stale link; the member
  simply stops appearing in `/api/org/members`. The maker remains (now effectively
  free-add); unlinking is manual. Acceptable.
