# Org fabric settings (admin) — design

**Date:** 2026-06-12
**Status:** Approved for planning
**Related:** builds on the AI fabric-yardage estimator ([[roadmap-ai-fabric-yardage]], `docs/superpowers/specs/2026-06-12-ai-fabric-yardage-design.md`)

## Problem

Fabric width, supplier, and price are entered by hand on every costume piece, with no
shared defaults. The AI yardage estimator assumes a hardcoded **45″** width when a piece's
width is blank — the org can't tune that. There's no org-managed supplier list, so supplier
names are free-typed and inconsistent (which also weakens the purchase list's
supplier grouping), and there's no default price to seed the cost rollup.

## Goal

An **admin-only org "Fabric" settings** area where an admin manages:

1. A list of **fabric widths**, one marked **default**.
2. A list of **suppliers**, each with its own **price per yard**, one marked **default**.

These defaults then (a) feed the **AI estimate** (default width replaces the hardcoded 45″
fallback), (b) **pre-fill** new costume pieces, and (c) act as **fallbacks** in the purchase-list
cost rollup for pieces left blank. Every value stays editable per piece.

### Decisions (from brainstorming)

1. **Apply mode = "Both"** — new pieces pre-fill with the defaults AND any piece left blank
   falls back to the org default in the AI estimate / cost rollup. (Consequence: a pre-filled
   piece keeps its value even if the org default later changes; only still-blank pieces track
   the current default. Accepted.)
2. **Price is per-supplier**, not a single global number — each supplier carries its own
   default price per yard, and a piece's price follows its chosen supplier.
3. **Width is a managed list** (not a single value) with one default; the per-piece width
   field becomes a dropdown sourced from the list.
4. **True admin-only** — only Clerk org Admins can see/edit fabric settings. This is the app's
   first real role check (today nothing is admin-restricted; the Makers tab is editable by any
   member). A reusable `requireOrgAdmin()` helper is added.

### Out of scope

- Foreign-keying pieces to settings rows (pieces keep storing plain strings/numbers).
- Fabric *type/color* defaults, supplier purchase links, or fabric images (the estimator spec's
  "fabric guidance" sub-ask stays unbuilt).
- Reordering UI for the lists (ordered by creation; default surfaced first).
- Retroactively rewriting existing pieces when a default changes.

## Architecture

### 1. Data model — migration `0021_fabric_settings.sql`

Two org-scoped tables, mirroring the existing `makers` table (org_id text = Clerk org id,
references the app-side `organizations` row pattern):

```sql
create table fabric_widths (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  value text not null,                 -- e.g. '54"' (display string, stored verbatim on pieces)
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table fabric_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  price_per_yard numeric,              -- nullable; a supplier may have no set price
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index on fabric_widths (org_id);
create index on fabric_suppliers (org_id);
```

Pieces keep storing plain strings/numbers (`fabric_width` text, `fabric_supplier` name,
`fabric_unit_cost` number) — **no FK**. So existing data is untouched, and deleting a
width/supplier never orphans an old piece (it keeps whatever was saved).

**Single-default invariant:** at most one `is_default = true` per `(org_id)` per table. Setting a
new default clears the previous one (handled in the data layer, in a single update pass).

### 2. Data layer — `src/lib/data/fabric-settings.ts`

Org-scoped CRUD for both lists:

- `listFabricWidths(orgId)`, `createFabricWidth(orgId, { value, isDefault })`,
  `updateFabricWidth(orgId, id, { value?, isDefault? })`, `deleteFabricWidth(orgId, id)`.
- `listFabricSuppliers(orgId)`, `createFabricSupplier(orgId, { name, pricePerYard, isDefault })`,
  `updateFabricSupplier(orgId, id, { name?, pricePerYard?, isDefault? })`,
  `deleteFabricSupplier(orgId, id)`.

Setting `isDefault: true` clears the prior default in that org+table. All queries are filtered by
`org_id`. Lists return rows ordered by `created_at`, default-first.

### 3. Admin gating — `requireOrgAdmin()` in `src/lib/auth-context.ts`

```ts
// Like getAuthContext, but also asserts the caller is an org Admin (Clerk role).
export async function requireOrgAdmin(): Promise<AuthContext> { ... }
```

Uses Clerk `auth()` — `has({ role: "org:admin" })` (or the `orgRole === "org:admin"` claim) —
and throws `AuthError(403, ...)` if not an admin. Reuses the existing `AuthContext`/`AuthError`
types and the `errorResponse` mapping (403 surfaces cleanly).

### 4. API — `src/app/api/org/fabric-settings/...`

- `GET /api/org/fabric-settings` → `{ widths, suppliers }` for the active org. **Any member**
  (needed to populate the per-piece dropdowns). Auth via `getAuthContext`.
- `POST` / `PATCH` / `DELETE` for widths and suppliers — **admin-only** via `requireOrgAdmin`;
  non-admins get 403. Calls `ensureOrganization(orgId, ...)` first (mirrors the makers POST).
  Route shape mirrors the existing `/api/makers` routes (sub-routes or a single route with a
  `kind: "width" | "supplier"` discriminator — the plan picks; prefer mirroring makers' layout).

### 5. Settings UI — `src/components/OrgFabricPanel.tsx`

Mounted as a second custom tab in `OrgSwitcher.tsx`:

```tsx
<OrganizationSwitcher.OrganizationProfilePage label="Fabric" labelIcon={...} url="fabric">
  <OrgFabricPanel />
</OrganizationSwitcher.OrganizationProfilePage>
```

Mirrors `OrgMakersPanel`. Two editors: a **Widths** list (add / edit value / delete / mark
default) and a **Suppliers** list (add / edit name + price / delete / mark default). Fetches via
`GET /api/org/fabric-settings` (`credentials: "include"`). The panel is shown only to admins —
if a non-admin somehow reaches it, it renders a read-only / "admins only" state, and the write
endpoints 403 regardless (defense in depth).

### 6. Consumer wiring

`loadCostumeCreationsData(orgId, production)` (already org-scoped; already called by the
Costume Creations page, the My Work page, and the estimate-fabric route) is extended to also
return `fabricWidths` and `fabricSuppliers` (rows incl. their `is_default` + price). This single
loader feeds all consumers:

- **AI estimate (width fallback)** — `src/app/api/productions/[id]/estimate-fabric/route.ts`:
  when building each `EstimateItem`, the fallback for a blank width becomes the **org default
  width** instead of nothing: `fabricWidth = item.fabric.width ?? defaultWidthValue ?? null`.
  The lib (`estimate-fabric.ts`) keeps its internal "assume 45″ if unknown" as the ultimate
  fallback when the org has set no default. No change to the lib's signature.

- **New-piece pre-fill + dropdowns** — `src/components/MakePieceRow.tsx` (the editable fabric
  row; receives the widths/suppliers as props threaded from `loadCostumeCreationsData` →
  `TailorSummary` → `MakeWorklist` → `MakePieceRow`):
  - A **new** fabric row pre-fills `width` = default width value, `supplier` = default supplier
    name, `unitCost` = default supplier's `price_per_yard` (all editable).
  - **Width** and **supplier** inputs become **dropdowns** sourced from the lists. If a piece
    already holds an off-list value, it's preserved as the current selected option (nothing is
    lost). If a list is empty, that field falls back to today's plain text input. A blank/"—"
    option is always available.
  - Selecting a supplier **auto-fills the unit-cost field** from that supplier's price **only
    when the cost field is blank** (never clobbers a typed price).

- **Cost rollup fallback** — `src/lib/tailor-summary.ts` `buildFabricPurchaseList`: a piece with
  no `unitCost` is valued at its supplier's `price_per_yard` (looked up by supplier name from a
  passed-in supplier-price map), then `0` if still unknown (today's behavior). The function gains
  an optional supplier-price-map parameter; callers without it keep the current behavior.

## Data flow

Admin edits widths/suppliers in the Fabric tab → persisted org-scoped. On the Costume Creations
/ My Work pages, `loadCostumeCreationsData` loads those lists alongside pieces and threads them to
`MakePieceRow` (dropdowns + pre-fill) and to `buildFabricPurchaseList` (cost fallback). Clicking
**Estimate fabric** runs the existing route, which now uses the org default width as the blank-
width fallback before calling Haiku. All per-piece values remain editable and authoritative.

## Testing

TDD throughout (Vitest, mirroring the repo's mock patterns):

- **Data layer** (`fabric-settings.test.ts`): CRUD for both lists; the single-default invariant
  (marking a new default clears the old); org-scoping (one org can't read/write another's rows);
  delete leaves the row gone without touching pieces.
- **`requireOrgAdmin`**: admin passes through to `{ userId, orgId }`; non-admin → 403; no
  active org → 403 (reuses existing behavior).
- **API routes**: GET returns the org's lists for a member; POST/PATCH/DELETE 403 for a
  non-admin and succeed for an admin; writes call `ensureOrganization`.
- **Estimate route**: with an org default width set and a piece missing width, the `EstimateItem`
  carries the default width; with no default set, falls back as before (lib assumes 45″).
- **Purchase list**: a piece with a supplier but no unit cost is costed at the supplier's price;
  unknown supplier or no map → 0 (unchanged).
- **`MakePieceRow`**: new row pre-fills the defaults; selecting a supplier fills a blank cost but
  not a typed one; an off-list saved value stays selectable.
- Verify `tsc` + `lint` + `vitest`; the live admin-role behavior is checked in an authenticated
  browser as admin and as a member.

## Risks / caveats

- **Migration 0021** must be applied to the shared Supabase project (local + prod) before the
  feature works; additive, so deployed code is unaffected until then. (See [[demo-and-db-state]].)
- **First admin-role check** — `requireOrgAdmin` is new; keep it small, well-tested, and reused
  by every write route so the gate is consistent.
- **Empty settings** must degrade gracefully: no widths/suppliers → dropdowns fall back to plain
  inputs, no pre-fill, AI keeps the 45″ assumption — i.e. exactly today's behavior.
- **Pre-fill vs. live default** — pre-filled pieces don't auto-update when a default changes
  (only blank pieces do via the calc fallback). Intended per decision #1.
- **String-stored piece fields** mean a renamed/deleted supplier doesn't propagate to old
  pieces; acceptable (and avoids destructive cascades).
```
