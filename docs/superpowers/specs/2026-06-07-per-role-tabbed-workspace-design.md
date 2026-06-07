# Per-Role Tabbed Workspace (Sub-project A) — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Part of:** the cast/measurements/costumes redesign. Follow-up cycles (separate specs): **photos** in Ideas & Notes, and **minimized-card indicators** (note/photo icon, per-role measurement circle, pieces icon).

## Problem

The workspace has two top-level tabs (Cast & Measurements / Costumes) spanning all roles. With a long cast list, switching from cast work near the bottom of the page to Costumes means scrolling back up — a chore. Move the tabs *into each role card* so everything for a role is in one place, and add a role-scoped Ideas & Notes tab.

## Goal

Replace the two top-level tabs with a single list of role cards. Each expanded card has its own tab strip — **Ideas & Notes | Cast & Measurements | Costume** — defaulting to Ideas & Notes. The cast switcher stays at the top and still scopes the Cast & Measurements and Costume tabs. Ideas & Notes holds a role-scoped notes textarea (auto-saved).

## Non-goals (separate follow-up specs)

- **Photo upload** in Ideas & Notes (Supabase Storage + compression).
- **Minimized-card indicators** (note/photo icon, per-role measurement circle, pieces icon). The minimized row is unchanged here except as already shown (role name + assigned name).

## Data model

- Migration `supabase/migrations/0009_role_notes.sql`: `alter table roles add column notes text;` (nullable). Chris runs it in Supabase.
- `Role` interface gains `notes: string | null`. `listRoles` already `select *`, so it returns notes once the column exists.

## Components / changes

### Data layer — `src/lib/data/roles.ts`

`setRoleNotes(productionId, roleId, notes: string)` — mirrors `setProductionNotes`: `.update({ notes: notes || null }).eq("id", roleId).eq("production_id", productionId).select().maybeSingle()`; `NotFoundError` if no row; returns the row.

### API — `src/app/api/productions/[id]/roles/[roleId]/route.ts`

Add a `PATCH` handler to the existing file (which has `DELETE`): body `{ notes?: string }` → `assertProductionInOrg` → `setRoleNotes(id, roleId, body.notes)` → `{ role }`; `errorResponse` on catch. (`typeof body.notes === "string"` guard.)

### `ProductionWorkspace.tsx`

- Remove the top-level `<Tabs>` (Roster | Costumes) and its two-tab rendering.
- Keep all existing state (`casts`, `selectedCastId`, `roles`, `performers`, `castings`, `designs`, `pieces`, `measurementStatus`) and the cast switcher UI.
- Render: cast switcher → the **add-role** control (relocated from RosterTab) → a single list of `<RoleCard>` (one per role).
- The casting/design/piece mutation handlers that today live in `RosterTab`/`CostumesTab` move here (or are passed to the panels), keeping state ownership in `ProductionWorkspace`.

### New `src/components/RoleCard.tsx`

Collapsible card for one role. Props: the role, `selectedCastId`, the per-role slices of state, and the handlers/setters it needs.
- **Minimized row:** role name + assigned (primary) performer name — unchanged from today. (Indicators are the follow-up spec.)
- **Expanded:** an internal tab strip — `Ideas & Notes | Cast & Measurements | Costume` — with per-card local `activeTab` state defaulting to `"ideas"`. Renders the active panel below.

### New per-role panels (extracted, behavior unchanged)

- **`RoleNotesPanel`** (`Ideas & Notes`): a notes textarea pre-filled from `role.notes`, auto-saving on blur via `PATCH /api/productions/[id]/roles/[roleId]` `{ notes }` (same in-flight-guarded pattern as `ProductionNotes`; no router refresh). Photos are added in the follow-up.
- **`RoleCastPanel`** (`Cast & Measurements`): the per-role roster content extracted from `RosterTab` — primary + understudies for `selectedCastId`, each with the existing `MeasurementDot` (from `measurementStatus[performerId]`), add-casting and remove-casting. Reuses the existing casting handlers and `MeasurementDot`.
- **`RoleCostumePanel`** (`Costume`): the per-role costume content extracted from `CostumesTab` — the `PieceEditor` (designs for the role) and the per-performer source/share rows for `selectedCastId`. Reuses the existing piece/source helpers (`costume-merge`, `pieceKey`, `resolvePieceSources`).

### Removed / repurposed

- `RosterTab.tsx` and `CostumesTab.tsx` top-level wrappers are removed; their per-role logic lives in the new panels. Shared bits (`MeasurementDot`, `PieceEditor`, the casting/design/source helpers) are kept and reused. `CollapsibleRole.tsx` is either reused by `RoleCard` or superseded — the plan decides based on fit.

## Data flow / state

State stays in `ProductionWorkspace`. Each `RoleCard` receives its role plus the shared state and the mutation callbacks; panels filter by `role.id` and `selectedCastId` exactly as the current tabs do. Switching cast updates `selectedCastId` and every open card's Cast/Costume panels re-filter — no reload.

## Error handling

- Role-notes save failure → inline error + busy reset (existing pattern).
- Cross-org / missing → 404 via `assertProductionInOrg` / `NotFoundError`.

## Testing

- `setRoleNotes` data fn (update + empty→null + `NotFoundError`).
- `PATCH …/roles/[roleId]` (notes → 200 calls `setRoleNotes`; 404 cross-org; existing DELETE test stays green).
- Relocated UI (panels, tab strip) — manual smoke; the casting/design/piece logic is reused, not rewritten, so existing data/route tests remain the safety net.

## Migration / demo dependency

`0009_role_notes.sql` must be applied in Supabase for role notes to work; the tab restructure itself works without it (notes just can't save).

## Risk

Highest-risk refactor in the app. Mitigation: relocate existing casting/design/piece logic verbatim into the panels (no behavior change), land behind the same state owner, and verify the full workspace flow manually before merge.
