# Fabric Supplier URLs + Clickable Shopping Links — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending spec review

## Summary

Add an optional **URL** to each fabric supplier in the org Fabric settings. On the **Shopping** tab of Costume Creations (and the My Work page, which reuses it), render each supplier's name as a link to its URL when one is known.

The wrinkle: a piece stores its supplier as **free text** (`costume_pieces.fabric_supplier`), not a foreign key to `fabric_suppliers`. So the Shopping list only has the supplier *name*. We resolve name → URL by building a name→URL map from the org's suppliers and matching case-insensitively.

Two product decisions (made during brainstorming):
- **Inline-editable URL** on each existing supplier row, plus a URL field in the add-supplier form (Nada already has suppliers and needs to add URLs to them).
- **Auto-prepend `https://`** to scheme-less URLs; **case-insensitive, trimmed** name matching; links **open in a new tab**.

All schema changes go in a new migration `supabase/migrations/0025_fabric_supplier_url.sql`. Nothing is pushed/deployed until Chris's explicit green light; the migration is applied to Supabase only when he says so.

## Current system (as found)

- `fabric_suppliers` (migration `0021`): `id` (uuid PK), `org_id` (text), `name` (text), `price_per_yard` (numeric, null), `is_default` (bool), `created_at`. Highest existing migration is `0024`.
- `src/lib/data/fabric-settings.ts`: `FabricSupplier` interface; `listFabricSuppliers(orgId)`, `createFabricSupplier(orgId, { name, pricePerYard, isDefault })`, `updateFabricSupplier(orgId, id, { name?, pricePerYard?, isDefault? })`, `deleteFabricSupplier(orgId, id)`.
- API: `POST /api/org/fabric-settings/suppliers`, `PATCH|DELETE /api/org/fabric-settings/suppliers/[id]` — all `requireOrgAdmin()`.
- `src/components/OrgFabricPanel.tsx`: add-supplier form (name + price inputs); existing rows show name + price + set-default + remove (no inline edit today).
- Shopping list: `src/components/FabricPurchaseList.tsx:46` renders `{l.supplier ?? "—"}` as plain text. The line objects come from `buildFabricPurchaseList()` in `src/lib/tailor-summary.ts`; `FabricLine.supplier` is a string derived from `costume_pieces.fabric_supplier` (free text). The builder currently has **no access** to supplier URLs.
- `loadCostumeCreationsData()` (shared loader) feeds both the Costume Creations page and the My Work page, which both render `<TailorSummary>` → `<FabricPurchaseList>`. A change here covers both pages.

## Decision 1 — Schema

`supabase/migrations/0025_fabric_supplier_url.sql`:

```sql
alter table fabric_suppliers add column if not exists url text;
```

Nullable; no backfill. Existing suppliers simply have `url = null` until edited.

## Decision 2 — Data layer (`fabric-settings.ts`)

- `FabricSupplier` gains `url: string | null`.
- A small exported helper normalizes input:

  ```ts
  // Trim; null when empty; prepend https:// when no scheme is present.
  export function normalizeSupplierUrl(raw: string | null | undefined): string | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }
  ```

- `createFabricSupplier(orgId, input)` accepts `url?: string | null`, stores `normalizeSupplierUrl(input.url)`.
- `updateFabricSupplier(orgId, id, patch)` accepts `url?: string | null`; when `url` is present in the patch, store `normalizeSupplierUrl(patch.url)` (so clearing the field → `null`).

## Decision 3 — API routes

- `POST /api/org/fabric-settings/suppliers`: read `url` (string) from the body, pass to `createFabricSupplier`.
- `PATCH /api/org/fabric-settings/suppliers/[id]`: read optional `url` from the body, include it in the patch when provided. Admin-gating unchanged.

## Decision 4 — Org Fabric panel UI (`OrgFabricPanel.tsx`)

- Add-supplier form: add a `url` text input (placeholder e.g. `Website (optional)`); include `url` in the POST body; clear it on success alongside name/price.
- Existing supplier rows: add an inline URL text input, prefilled with `s.url ?? ""`, that saves on blur via `PATCH /api/org/fabric-settings/suppliers/${s.id}` with `{ url }` (reusing the existing `send()` helper). Keep set-default / remove as they are.
- Layout stays within the current row/form structure; no redesign.

## Decision 5 — Resolving name → URL on the Shopping list

- `loadCostumeCreationsData()` additionally calls `listFabricSuppliers(orgId)` and builds a `Record<string, string>` mapping **normalized supplier name → url** (only suppliers that have a url). Normalize the key with `name.trim().toLowerCase()`.
- Thread the map to `<TailorSummary>` → `<FabricPurchaseList>`. `buildFabricPurchaseList(...)` gains a parameter `supplierUrls: Record<string, string>` (default `{}`) and sets `supplierUrl: supplierUrls[(supplier ?? "").trim().toLowerCase()] ?? null` on each `FabricLine`.
- `FabricLine` gains `supplierUrl: string | null`.
- `FabricPurchaseList.tsx` renders:

  ```tsx
  {l.supplierUrl && l.supplier ? (
    <a href={l.supplierUrl} target="_blank" rel="noopener noreferrer" className="link-red">
      {l.supplier}
    </a>
  ) : (
    l.supplier ?? "—"
  )}
  ```

  (`link-red` is the existing global link class — curtain-red with a dotted underline; falls back to plain text when no URL or no supplier.)

## Testing (TDD)

- **`fabric-settings.test.ts`**: `normalizeSupplierUrl` (`joann.com` → `https://joann.com`; `http://x` and `https://x` unchanged; `""`/whitespace → `null`). `createFabricSupplier` inserts the normalized `url`. `updateFabricSupplier` patches a normalized `url` (and clears to `null` on empty).
- **fabric-settings route test**: POST passes `url` to `createFabricSupplier`; PATCH passes `url` to `updateFabricSupplier`.
- **`tailor-summary.test.ts`**: `buildFabricPurchaseList` sets `supplierUrl` from the map (case-insensitive match), and `null` when the supplier name isn't in the map or has no url.
- **`FabricPurchaseList`**: no DOM test (node Vitest env, no jsdom) — verified by `tsc --noEmit` + `npm run build`, consistent with the rest of the UI.

## Scope / non-goals

- No URL validation beyond scheme-prepend (admin-only field, Nada controls it).
- Piece supplier stays free text; no FK, no data migration, no change to how pieces store the supplier.
- No change to the AI estimator, widths, or pricing rollup.
- The Costume tab's per-piece supplier input is unchanged (this feature only affects the org settings panel and the Shopping list rendering).

## Rollout

1. TDD the data layer (`url` + `normalizeSupplierUrl`) → API routes → loader map → `buildFabricPurchaseList`.
2. Wire `OrgFabricPanel` URL inputs and `FabricPurchaseList` link rendering (verified via tsc/build).
3. Apply `0025` to Supabase **only after** Chris's green light; commit locally; do not push/deploy until told.
