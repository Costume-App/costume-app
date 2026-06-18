# Cross-Org Production Sharing — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending spec review

## Summary

Let an organization share one of its productions to another organization as a **one-time, independent copy** (a template the recipient owns and edits). Sharing copies only the **design layer** — roles and their notes/idea photos, and costume designs with their notes/photos — and **excludes everything performer-specific** (performers, casts, castings, the per-performer costume-piece rows, measurements) plus production-specific schedule and org-level settings.

Mechanism: a source-org admin creates a **share link** (random token), optionally emailed via the existing Resend helper. The recipient opens the link, signs in (or signs up) with an active org, and accepts — the server copies the design layer (duplicating image files to new storage paths) into a **new production in the recipient's org** and redirects them to it.

This is sub-project 1 of the larger pricing+sharing request; **pricing/billing is a separate later project**. Two gates are intentionally deferred to that project (hooks left clean): (a) restricting *who may share* to paying orgs, and (b) requiring the recipient to *subscribe to use* the copy. Today any org admin may share and the accepted copy is immediately usable.

## Current system (as found)

- Productions are org-scoped: `productions.org_id` (Clerk org id), `created_by`. Access checks live in `src/lib/data/production-access.ts` (`assertProductionInOrg(orgId, productionId)` → 404 if not in org). `getAuthContext()` → `{ userId, orgId }`; `requireOrgAdmin()` → admin-gated `{ userId, orgId }`. No existing cross-org sharing.
- The entity graph under a production:
  - **Design layer (no performer):** `roles` (`name`, `notes`, `display_order`), `role_images` (`role_id`, `storage_path`), `costume_designs` (`role_id`, `name`, `notes`, `display_order`, `inventory_item_id`), `costume_design_images` (`costume_design_id`, `storage_path`).
  - **Performer layer (excluded):** `performers`, `casts`, `castings`, `costume_pieces` (keyed `(costume_design_id, casting_id)` — fabric/source/maker/made/source_note), `performer_measurements`.
  - Also production-scoped but **excluded**: `show_dates`. Org-scoped (not production data): `makers`, `fabric_widths`, `fabric_suppliers`.
- Images live in one private Supabase Storage bucket `role-images` (`src/lib/storage.ts`, `ROLE_IMAGES_BUCKET`): roles at `${prod}/${role}/<uuid>.jpg`, designs at `${prod}/designs/${design}/<uuid>.jpg`. Helpers exist: `uploadImage`, `signImageUrls`, `removeImages`, **`copyImage(fromPath, toPath)`** (already used for design→inventory photo copies).
- Data loaders take ids, not orgs, and the caller gates (e.g. `listRoles(productionId)`, `listCostumeDesigns(productionId)`, `listRoleImagesForRoles(roleIds)`, `listCostumeDesignImages(designId)`, `createProduction({orgId, createdBy, title, notes})`).
- Highest migration: `0026`. Email helper `sendEmail` (Resend) no-ops without a key. `crypto.randomUUID()` is used for storage filenames already.

## Decision 1 — What is copied

Copied into the new production (in order): the **production** (new row in recipient org), **roles** (`name`, `notes`, `display_order`), **role_images** (rows + duplicated files), **costume_designs** (`name`, `notes`, `display_order`; `inventory_item_id` set to `null` — inventory is org-specific), **costume_design_images** (rows + duplicated files).

**Not copied:** performers, casts, castings, costume_pieces, performer_measurements, show_dates, makers, fabric settings, the source `created_by`/timestamps.

The new production's `title` = the source title verbatim (recipient renames if they want); `notes` = source production `notes`; `is_active` = true; `created_by` = the accepting user; `costumes_due_date` = null.

## Decision 2 — Schema (`supabase/migrations/0027_production_shares.sql`)

```sql
create table if not exists production_shares (
  id                      uuid primary key default gen_random_uuid(),
  source_production_id    uuid not null references productions(id) on delete cascade,
  source_org_id           text not null,
  created_by              text not null,
  token                   text not null unique,
  recipient_email         text,
  status                  text not null default 'pending' check (status in ('pending','accepted','revoked')),
  accepted_by_org_id      text,
  accepted_production_id  uuid references productions(id) on delete set null,
  created_at              timestamptz not null default now(),
  accepted_at             timestamptz
);
create index if not exists production_shares_token_idx on production_shares (token);
create index if not exists production_shares_source_idx on production_shares (source_production_id);
```

Single-use: a share is `accepted` exactly once. `on delete cascade` for the source means deleting the source production removes its pending shares; `set null` on the accepted copy keeps the historical row if the copy is later deleted.

## Decision 3 — Data layer (`src/lib/data/production-shares.ts`)

```ts
export interface ProductionShare {
  id: string;
  source_production_id: string;
  source_org_id: string;
  created_by: string;
  token: string;
  recipient_email: string | null;
  status: "pending" | "accepted" | "revoked";
  accepted_by_org_id: string | null;
  accepted_production_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

// Random URL-safe token via crypto.randomUUID() (two joined for entropy).
export async function createProductionShare(input: {
  sourceProductionId: string;
  sourceOrgId: string;
  userId: string;
  recipientEmail: string | null;
}): Promise<ProductionShare>;

export async function listSharesForProduction(productionId: string): Promise<ProductionShare[]>;

// For the recipient preview page. Returns the share + a small summary of the source.
export async function getShareByToken(token: string): Promise<{
  share: ProductionShare;
  source: { title: string; roleCount: number; designCount: number };
} | null>;

// Revoke a still-pending share (no-op-safe if already accepted/revoked → returns false).
export async function revokeShare(productionId: string, shareId: string): Promise<void>;

// The copy engine. Validates the token is 'pending'; copies the design layer into a
// new production in recipientOrgId (duplicating image files); marks the share accepted.
// Throws ValidationError if the token is missing/already used/revoked. Returns the new id.
export async function acceptProductionShare(input: {
  token: string;
  recipientOrgId: string;
  userId: string;
}): Promise<{ productionId: string }>;
```

**`acceptProductionShare` copy algorithm:**
1. Load + validate the share (status `pending`); load source roles, role_images, costume_designs, costume_design_images.
2. `createProduction({ orgId: recipientOrgId, createdBy: userId, title, notes })`.
3. For each source role → insert a new role (name/notes/display_order) under the new production; build `oldRoleId → newRoleId`. For each role image: `copyImage(oldPath, newPath)` where `newPath = ${newProd}/${newRole}/<uuid>.jpg`, insert a `role_images` row.
4. For each source design → insert a new `costume_designs` row under the new production + mapped new role (`inventory_item_id: null`); build `oldDesignId → newDesignId`. For each design image: `copyImage(oldPath, newPath)` where `newPath = ${newProd}/designs/${newDesign}/<uuid>.jpg`, insert a `costume_design_images` row.
5. Mark the share `accepted` (`accepted_by_org_id`, `accepted_production_id`, `accepted_at`).
6. Return `{ productionId: newProd }`.

Image-copy failures are swallowed per-file (best-effort: a missing source object shouldn't abort the whole copy) and logged; the row is still created pointing at the intended new path (a broken image is recoverable; a half-failed accept is not). Performer-layer tables are never read or written.

## Decision 4 — API routes

- **`POST /api/productions/[id]/shares`** — `requireOrgAdmin()`; `assertProductionInOrg(orgId, id)`; body `{ recipientEmail?: string }`. Creates the share; if `recipientEmail` is present, best-effort `sendEmail` (try/catch, never fails the request) containing the absolute accept link, built server-side from the request origin: `${new URL(request.url).origin}/share/${token}`. Returns `{ share, token }` (201) — the client builds the copyable link as `${window.location.origin}/share/${token}` (no new env var needed).
- **`DELETE /api/productions/[id]/shares/[shareId]`** — `requireOrgAdmin()`; `assertProductionInOrg`; `revokeShare(id, shareId)`. Returns `{ ok: true }`.
- **`POST /api/shares/[token]/accept`** — `getAuthContext()` (signed-in + active org required; no admin needed — accepting into your own org); `acceptProductionShare({ token, recipientOrgId: orgId, userId })`. Returns `{ productionId }` (201). `ValidationError` (used/revoked token) → 400.

Admin gating reuses the existing `requireOrgAdmin` (the app's admin-write pattern). The source production's org is verified via `assertProductionInOrg`; the share row's `source_org_id` is also checked on revoke.

## Decision 5 — UI

- **Source (`SharePanel`, admin-only, on the production detail page):** an expand-from-link "Share production →". Expanded: a one-line "what's shared / what's not" summary; a **Create link** button → `POST .../shares` → shows the link (`${window.location.origin}/share/${token}`) with a **Copy** button + an optional email field and **Send**; a list of existing pending shares (recipient email or "link", created date) each with **Revoke**. Mounted only when the viewer is an org admin (gate via a server-passed `isAdmin` prop or a Clerk client check consistent with how the Fabric tab is gated).
- **Recipient (`/share/[token]` page, in the authed `(app)` group so Clerk handles sign-in/up + org onboarding):** server-loads `getShareByToken`. Renders the source title + "X roles · Y designs · includes notes & idea photos · no performers or measurements," and an **Accept & copy to my organization** button (client component → `POST /api/shares/[token]/accept` → on success `router.push("/productions/<newId>")`). States handled: token not found / already accepted / revoked (friendly message, no accept button); signed-in but **no active org** (prompt to create/select an org first, linking to onboarding).

## Testing (TDD)

- **`production-shares.test.ts`** (data layer, chained-mock pattern; storage helpers mocked):
  - `createProductionShare` inserts a row with a non-empty unique `token`, `status 'pending'`, the source/org/user, and the recipient email (or null).
  - `acceptProductionShare` **copies the design layer**: creates a production in the recipient org, inserts roles + designs mapped to new ids, and calls `copyImage` for each role/design image with new-prod-scoped paths; **never reads or writes** performers/casts/castings/costume_pieces/measurements (assert those tables are not queried).
  - `acceptProductionShare` rejects a token whose status is `accepted` or `revoked` (`ValidationError`); marks the share accepted on success.
  - `getShareByToken` returns null for an unknown token; returns the summary counts for a known one.
  - `revokeShare` updates status scoped by `(id, source_production_id)`.
- **Route tests:** `POST shares` is admin-gated (403 non-admin) and best-effort-emails (still 201 when `sendEmail` throws); `DELETE shares/[shareId]` admin-gated; `POST shares/[token]/accept` requires auth (401) and returns `{ productionId }`, 400 on a used token.
- **Recipient page + SharePanel:** no DOM tests (node env) — verified via `tsc --noEmit` + `npm run build`.

## Scope / non-goals (this sub-project)

- **No billing/plan gating.** "Only paying orgs may share" and "recipient must subscribe to use the copy" are the *pricing* project's job; left as clean extension points (a single check in the share-create route and one in accept, added later).
- **One-time copy only** — no live sync; later source edits don't propagate.
- **Single-use** links (generate another to share again); no bulk/multi-recipient management beyond listing+revoking.
- Excludes performers, casts, castings, per-performer pieces, measurements, show dates, makers, fabric settings.
- No re-share of a received copy restriction (a copy is a normal production and could itself be shared — acceptable).

## Rollout

1. TDD the data layer (schema `0027`, `createProductionShare`/`getShareByToken`/`acceptProductionShare`/`revokeShare`) → API routes.
2. Build `SharePanel` (source) and the `/share/[token]` recipient page (verified via tsc/build).
3. Apply `0027` to Supabase **only after** Chris's green light; commit locally; do not push/deploy until told. (Sharing works without any email config; emailing the link needs `RESEND_API_KEY` + verified domain, same as feedback.)
