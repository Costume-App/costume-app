# Cancel & Delete a Production — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)

## Problem

A user may change their mind about creating a production — either while filling
out the new-production form, or after it already exists. Today there is no way to
back out:

- The new-production form (`/productions/new`) has only a submit button.
- A created production has no delete affordance.

## Goals

1. Let the user abandon the new-production form without saving (no DB record is
   created until submit, so this is a pure navigation discard).
2. Let the user delete an already-created production, with a deliberate
   type-to-confirm gate, cascading to all child data.

## Non-goals

- No "soft delete"/archive/restore. Deletion is permanent (matches the rest of
  the app's delete semantics).
- No bulk delete of multiple productions.
- No change to how productions are created.

## Background (current state)

- Creation UI: `src/app/productions/new/page.tsx` — single form (title required,
  show date optional). Persists only on submit via `POST /api/productions`.
- Production page: `src/app/productions/[id]/page.tsx`, with
  `src/components/ProductionWorkspace.tsx` rendering the tabbed workspace.
- Existing delete pattern (casts/roles/designs): `confirm()` dialog → `fetch`
  DELETE → filter local state / redirect → show error on failure.
- Data layer: `src/lib/data/productions.ts` (`createProduction`, etc.);
  org-scoping via `assertProductionInOrg(orgId, id)`.
- DB: child tables (casts, roles, performers, castings, designs, pieces) have
  `on delete cascade` FKs, so deleting the production row removes all children.
- UI conventions (Atelier/theatrical): `.btn-primary` (red) for primary actions,
  `.btn-ghost` for secondary, `.link-muted` for quiet links; rare/dangerous
  actions collapse behind an expand-from-link.

## Design

### Part A — Cancel on the new-production form

Add a **"Cancel"** button to `src/app/productions/new/page.tsx`, beside the
submit button, styled `.btn-ghost`. It navigates to `/productions`. No API call
and no cleanup are needed because nothing is persisted until submit; the typed
title/date are simply discarded.

### Part B — Delete an existing production (type-to-confirm)

On the production page header, add a quiet **"Delete production"** link
(`.link-muted`), positioned so it is not a prominent action. Clicking it expands
inline (expand-from-link convention) to reveal:

- A warning: deleting removes the production **and all its cast, roles, castings,
  costume designs, and pieces**.
- A text input labeled *Type `delete` to confirm*.
- A **"Delete permanently"** button (`.btn-primary`), **disabled until the input
  exactly matches `delete`** (case-insensitive, trimmed).
- A "Never mind" link that collapses the expander.

Flow: confirm → `DELETE /api/productions/[id]` → on success redirect to
`/productions`; on failure show an inline error using the existing error pattern.
A `busy` state disables the button during the request.

## Components to build / change

1. **Data layer** — `deleteProduction(orgId, productionId)` in
   `src/lib/data/productions.ts`. Calls `assertProductionInOrg(orgId,
   productionId)` then deletes the production row (children cascade). Throws on
   Supabase error, matching `deleteCast` etc.

2. **API route** — `DELETE` handler in `src/app/api/productions/[id]/route.ts`:
   `getAuthContext()` → `assertProductionInOrg` → `deleteProduction` →
   `NextResponse.json({ ok: true })`; `errorResponse(err)` on failure. (Confirm
   whether this route file exists; create it if not.)

3. **Form Cancel** — `src/app/productions/new/page.tsx`: add `.btn-ghost`
   Cancel button → navigate to `/productions`.

4. **Delete UI** — a small client component for the type-to-confirm expander,
   rendered in the production page header. Holds local state for
   expanded/confirmation-text/busy/error.

## Decisions

- **Type-to-confirm replaces native `confirm()` for this action.** The rest of
  the app uses `confirm()` for lighter deletes; deleting an entire production
  warrants the stronger gate the user requested.
- **Confirmation word is `delete`** (not the production title) — simpler to type
  during a live demo while still being deliberate. Could be upgraded to require
  the title later.

## Error handling

- Delete failure: inline error message (existing pattern), `busy` reset, no
  redirect.
- Org mismatch / not found: surfaced by `assertProductionInOrg` →
  `errorResponse`.

## Testing

No automated test suite is configured in this project. Manual verification:
1. New-production form: type title → Cancel → returns to list, no production
   created.
2. Delete: button disabled until `delete` typed; on confirm the production and
   its children are gone and the user lands on `/productions`.
3. Delete failure path shows an inline error and does not redirect.
