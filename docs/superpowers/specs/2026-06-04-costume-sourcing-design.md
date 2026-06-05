# Costume Sourcing (Make / On-hand / Shared) — Design

**Date:** 2026-06-04
**Status:** Approved, ready for implementation plan
**Parent spec:** `2026-06-04-costume-app-design.md` (§3 data model, §4 costume model, §5 fabric engine)
**Milestone:** M3 Slice 1 — per-piece sourcing (the affordability layer, ahead of the fabric-calc engine)

## 1. Goal

Let Nada define each character's costume as a list of garment **pieces** once per role, then mark how each performer obtains each piece: **Make** (sew from fabric — the default, and the only source that will later count toward fabric totals + budget), **On-hand** (the org already owns it), or **Shared** (reuses another performer's identical garment). This captures the sourcing decisions now so the deferred fabric-calc engine can simply read them later.

This slice deliberately does **not** compute fabric yardage — that needs Nada's formulas and is gated. It establishes the data + UI that the engine plugs into.

## 2. UX

The production detail page (`/productions/[id]`) becomes a **tabbed workspace** over a shared header.

**Shared header (both tabs):**
- Cast switcher chips (Gold / Blue …) — existing, unchanged (add / rename / recolor / delete cast).
- The role **roster**, rendered as a **collapsible-by-role** list. Each role collapses to a single line; **default collapsed**. Opening a role reveals its content for the active tab. One level of collapse only (open a role → all its performers shown at once).

**Tabs:**
1. **Cast and Measurements** — owns the roster: add roles, assign primary + understudies, the measurement-progress circle, and each performer's **name as a link** to their measurement page. (This is today's `CastWorkspace` behavior, now collapsible and tabbed.) Collapsed-role summary: **primary name**.
2. **Costumes** — read-only on casting; adds sourcing. Each role has a piece list defined once ("edit" by the role name). Opening a role lists every performer (primary + understudies, in the active cast) with a **source dropdown per piece** (Make / On-hand / Shared). Collapsed-role summary: **primary name · N pieces**.

Tab bar is built **generic (N tabs)** so a future "Materials" tab drops in; it wraps/scrolls on narrow screens.

### Source dropdown behavior
- Default shown is **Make** (even with no stored row — see lazy rows below).
- Choosing **On-hand** → optional source note (later: pick from inventory).
- Choosing **Shared** → a picker of other performers cast in the **same role** (same `costume_design`), **across casts** (e.g. Blue Bert borrows Gold Bert's jacket). Selecting a target stores a reference to that performer's piece of the same design.

## 3. Data model

New migration `0005_costume_sourcing.sql`. Two tables, trimmed to this slice (fabric/garment-template columns are added later by the engine slice; their absence does not block anything here).

**`costume_designs`** — one garment in a character's costume, defined once per role:
```
id             uuid pk
production_id  uuid not null → productions(id) on delete cascade
role_id        uuid not null → roles(id) on delete cascade
name           text not null            -- e.g. "Jacket", "Trousers", "Vest"
display_order  int  not null default 0
created_at     timestamptz not null default now()
```
A role has 0..N design rows. Scoped by `production_id` for tenant-safe queries (mirrors existing `assertProductionInOrg` pattern).

**`costume_pieces`** — one performer's instance of a design, holding the source:
```
id                    uuid pk
costume_design_id     uuid not null → costume_designs(id) on delete cascade
casting_id            uuid not null → castings(id) on delete cascade
source                text not null default 'make'   -- check in ('make','on_hand','shared')
shared_with_piece_id  uuid null → costume_pieces(id) on delete set null
source_note           text null
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
unique (costume_design_id, casting_id)
```

**Lazy rows, default Make.** A performer's piece displays "Make" with **no row**. Setting On-hand or Shared **upserts** a row (on the unique key). Setting back to Make deletes the row (keeps the table sparse). This mirrors how `performer_measurements` only stores filled fields. Reads therefore left-join designs × castings against existing piece rows and treat missing as `make`.

## 4. Sharing semantics & guardrails

- "Shared" means this performer reuses another performer's identical garment (same `costume_design`).
- The picker lists pieces of the **same design** belonging to **other castings** (any cast in the production).
- On selection, ensure the target's piece row exists (auto-create as `make` if missing) and store its `id` in `shared_with_piece_id`.
- Guardrails: cannot share with self; cannot point at a piece that is itself `shared` (no chains); if a target piece is deleted (casting/design removed), `shared_with_piece_id` nulls out and the borrower falls back to displaying Shared-but-unresolved → treated as needing re-selection.

## 5. API surface

Follows existing conventions (`getAuthContext` → `assertProductionInOrg` → Supabase → JSON; `errorResponse`; `credentials:"include"` on client fetches).

**Designs (per role):**
- `GET  /api/productions/[id]/designs` — list all designs for the production (grouped by role client-side), or `?roleId=` filter.
- `POST /api/productions/[id]/designs` — `{ roleId, name }` → create (append `display_order`).
- `PATCH /api/productions/[id]/designs/[designId]` — `{ name?, display_order? }`.
- `DELETE /api/productions/[id]/designs/[designId]` — cascades its pieces.

**Pieces (sourcing):**
- `GET  /api/productions/[id]/pieces` — all piece rows for the production (client merges with designs × castings; missing = make).
- `PUT  /api/productions/[id]/pieces` — `{ designId, castingId, source, sharedWithPieceId?, sourceNote? }` → upsert; `source:'make'` with no note deletes the row. Validates design + casting ∈ production, and (for shared) that the target is same-design / not-self / not-a-chain.

Tenant safety: every design/piece mutation re-validates the parent production ∈ org and that referenced `roleId`/`castingId`/`designId` belong to that production (closing IDOR the way the casts/castings routes already do).

## 6. Component architecture

The current monolithic `CastWorkspace` is split so each unit has one job:

- **`ProductionWorkspace`** (new, client) — owns the shared cast switcher + tab state ("Cast and Measurements" | "Costumes") + the collapsed/expanded role state. Renders the active tab. Generic `Tabs` so a third tab is trivial.
- **`RosterTab`** (≈ today's `CastWorkspace` content) — roles + castings management, measurement circles, name-as-link. Now rendered inside a collapsible role.
- **`CostumesTab`** (new) — per-role piece editor + per-performer source dropdowns + Shared picker.
- **`CollapsibleRole`** (new, shared) — the one-line collapsed header (with tab-specific summary slot) + expanded body slot.
- Server page assembles initial data (casts, roles, castings, performers, measurement status, **designs**, **pieces**) and passes to `ProductionWorkspace`.
- Data layer: new `src/lib/data/costume-designs.ts` and `src/lib/data/costume-pieces.ts` (list/create/update/delete/upsert), plus a `getPieceCountsByRole` helper for the collapsed "N pieces" summary.

Source-option palette/labels live in a small shared module (`src/lib/costume-sources.ts`: `make`/`on_hand`/`shared` → label) for reuse and test stability.

## 7. Testing

Vitest, matching existing data-layer + route test style (mock `supabaseAdmin`, mock data layer in route tests):
- designs: create appends order; delete scoped to production; cross-tenant guard.
- pieces: upsert on unique key; `make` deletes row; shared validation (same-design, not-self, no-chain); missing row reads as make.
- routes: 200/400/404 paths; color-style call-arg assertions; IDOR guards.
- A merge helper test: designs × castings minus rows → per-performer source list defaulting to make.

## 8. Designed-for, out of scope (roadmap accommodation)

Recorded so the extension points are on the record; **not built in this slice**:

1. **Materials tab (fabric to purchase)** — a third production tab (generic tab bar already supports it). Reads `source='make'` pieces + the engine columns added later (`computed_yardage`; `fabric_width/type/color` on `costume_designs`; `garment_templates.formula`). Aggregates yardage per fabric + budget. Additive only.
2. **Costume-idea photos per role** — new `role_images` table (`id, production_id, role_id, storage_path, caption, created_at`) + a Supabase Storage bucket; UI lives in the Costumes tab's expanded-role area. Additive migration + bucket.
3. **Inventory of on-hand pieces** — **org-scoped** (reusable across shows), so its own top-level area, *not* a production tab. New `inventory_items` table; later a nullable `costume_pieces.inventory_item_id → inventory_items`, and the On-hand selector gains a "pick from inventory" picker (same pattern as the Shared picker). The `on_hand` source row created in this slice is the anchor.

**Photo guardrail (1 & 3):** project hard-rule = *no photos of children*. All photo features upload **costume/garment** images only; UI copy must state "photos of costumes, not performers."

## 9. Build sequence (for the plan)

1. Migration `0005` (two tables) + run in Supabase.
2. Data layer + tests (`costume-designs.ts`, `costume-pieces.ts`, merge/count helpers, `costume-sources.ts`).
3. API routes + tests (designs, pieces).
4. UI refactor: `Tabs` + `ProductionWorkspace`, extract `RosterTab` from `CastWorkspace`, add `CollapsibleRole` (default collapsed), wire measurement-status into the collapsible roster.
5. `CostumesTab`: piece editor, source dropdowns, Shared picker.
6. Manual smoke pass (human, browser — Clerk-gated) + memory/roadmap update.
