# Editable / Removable Roles + Editable Cast Names — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Problem

Roles can be added but not renamed or removed from the UI, and cast member names can be removed but not renamed. Users need to fix typos and drop roles directly in the workspace.

## Goal

- Role card **header** (shown both collapsed and expanded) gets a ✎ pencil to **rename** the role inline and an × to **remove** the role with an **inline** confirmation.
- On the **Cast & Measure** tab, each cast member name gets a ✎ pencil to **rename** inline, alongside the existing × remove. The name stays a link to the measurements page.

## Data layer

- `updateRole(productionId, id, name)` in `roles.ts` — trim, `ValidationError` if empty, scoped update (`id` + `production_id`), `.select().maybeSingle()`, `NotFoundError` if missing; returns `Role`.
- `updatePerformer(id, label)` in `performers.ts` — trim, `ValidationError` if empty, update `label` by `id`, `.select().maybeSingle()`, `NotFoundError` if missing; returns `Performer`.

## API

- Role `PATCH /api/productions/[id]/roles/[roleId]` — widen body to `{ name?: string; notes?: string }`: if `typeof body.name === "string"` → `updateRole` → `{ role }`; else (existing) `setRoleNotes` → `{ role }`.
- Performer `PATCH /api/performers/[performerId]` (new handler on the existing route) — body `{ label?: string }` → `getAuthContext` → `assertPerformerInOrg(orgId, performerId)` → `updatePerformer(performerId, label)` → `{ performer }`.

## UI

### `RoleCard.tsx` — owns the card shell + header (replaces `CollapsibleRole`)

`CollapsibleRole` is only used by `RoleCard`; fold its `<li>`/tint/edge/collapse shell into `RoleCard` so the header can host role actions, then delete `CollapsibleRole.tsx`.

Header is a flex row (always rendered, both states) with three modes:
- **Normal:** a toggle button (`▸/▾` + role name + collapsed summary) that flips the persistent `open`; then a ✎ **rename** button and an **×** remove button on the right. (Pencil/× are siblings of the toggle button — not nested — to keep valid HTML.)
- **Renaming:** the row becomes an inline form — text input prefilled with the role name + Save + Cancel. Save → role `PATCH { name }` → update `roles` state (via `setRoles`, newly passed into `RoleCard`) → exit renaming.
- **Confirming delete:** the row becomes "Delete "{name}"? This removes its cast assignments and costumes. [Delete] [Cancel]". Delete → `DELETE /api/productions/[id]/roles/[roleId]` → on success drop the role from `roles` and its orphaned rows from `castings` (by `roleId`), `designs` (by `role_id`), and `pieces` (by those design ids). Cancel → back to normal.

Local state added: `renaming`, `nameValue`, `confirmingDelete`, `busy`, `error`. The body (tab strip + active panel) renders below the header when `open`, unchanged. A local `PencilIcon` is added (the existing one in `ProductionWorkspace` isn't exported).

### `RoleCastPanel.tsx` → `CastLink` — inline rename

`CastLink` gains a ✎ pencil and local rename state: clicking it swaps the name for an inline input (Save/Cancel). Save → `PATCH /api/performers/[performerId] { label }` → update `performers` state (via the existing `setPerformers` in `RoleCastPanel`). The × remove and the measurements link are unchanged. `RoleCastPanel` gets a `renamePerformer(performerId, label)` handler.

## Data flow / state

`ProductionWorkspace` already owns `roles`/`setRoles`, `performers`/`setPerformers`, `castings`/`setCastings`, `designs`/`setDesigns`, `pieces`/`setPieces`. `setRoles` is now also passed to `RoleCard`. Renames/deletes update these in place — no reload. The persisted open/tab state (sessionStorage) is unaffected.

## Error handling

- Empty name/label → `ValidationError` → 400, surfaced inline; row stays in edit mode for retry.
- Cross-org / missing → 404 via `assertProductionInOrg` / `assertPerformerInOrg` / `NotFoundError`.

## Testing

- `updateRole` (update + empty→ValidationError + NotFoundError); `updatePerformer` (same three).
- Role `PATCH` name branch (200 → `updateRole`; notes still works; 404); performer `PATCH` (200 → `updatePerformer`; 404 cross-org).
- UI (header rename/delete, CastLink rename) — manual smoke.

## Migration / demo dependency

None.
