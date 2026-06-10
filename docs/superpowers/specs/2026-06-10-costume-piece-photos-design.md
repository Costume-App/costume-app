# Photos on Costume Pieces — Design

**Date:** 2026-06-10
**Status:** Approved

## Summary

Let each costume **piece** carry reference photos ("this is what we're going
for"), shown and managed in the **Pieces** area of a role's Costume tab. Reuses
the proven role-reference-photo stack (Supabase Storage, signed URLs, client
compression, thumbnail strip + lightbox). First item in Nada's confirmed backlog
([[roadmap-nada-feedback-2026-06-10]]).

## Decisions (from brainstorming)

- **Attach level:** the **piece definition** = a `costume_designs` row (e.g.
  "Black skirt"). Photos are shared across every performer cast in that role —
  NOT per-performer. They live in the Costume tab's "Pieces" section.
- **Count:** up to **6 photos per piece** (match the role photo cap).
- **Storage:** reuse the existing **`role-images`** bucket with a `designs/…`
  path prefix. No new bucket.
- **Component:** extract a generic `PhotoStrip` from `RolePhotos`; `RolePhotos`
  becomes a thin wrapper; the piece UI uses `PhotoStrip` pointed at the designs
  endpoint.
- **Migration required:** unlike the last few features, this needs a Supabase
  migration applied to prod on deploy.

## Domain note

In the code, the "pieces" a user names (umbrella, black skirt) are
`costume_designs` (one per role, created via `POST /api/productions/[id]/designs`).
The per-performer rows in the Costume tab are `costume_pieces` (source/fabric/made
assignments). Photos attach to the **design**, so one photo set per piece applies
to all performers in the role.

## Data model — migration `0012_costume_design_images.sql`

(Next sequential migration; confirm the number at build time.) Mirror
`role_images` (migration `0010`):

```sql
create table if not exists costume_design_images (
  id uuid primary key default gen_random_uuid(),
  costume_design_id uuid not null references costume_designs(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
```

Add an index on `costume_design_id` if `role_images` has the equivalent on
`role_id` (match whatever the 0010 migration does). **Apply to prod on deploy.**

## Storage — generalize `src/lib/storage.ts`

The current helpers (`uploadRoleImage`, `signRoleImageUrls`, `removeRoleImages`)
all operate on `ROLE_IMAGES_BUCKET` at an arbitrary `path`. Add bucket-level
generics and make the role-named functions delegate (so the role route/tests are
untouched):

```ts
export async function uploadImage(path: string, bytes: Uint8Array): Promise<void>;
export async function signImageUrls(paths: string[], expiresIn?: number): Promise<Record<string, string>>;
export async function removeImages(paths: string[]): Promise<void>;
// existing:
export const uploadRoleImage = uploadImage; // (or thin wrappers) — same bucket
```

Design images use paths like `${productionId}/designs/${designId}/${uuid}.jpg`.

## Data layer — `src/lib/data/costume-design-images.ts`

Mirror `role-images.ts`:

- `listCostumeDesignImages(designId)` — one design's images, oldest-first.
- `listCostumeDesignImagesForDesigns(designIds)` — all images for a role's
  designs in one query (for page load).
- `countCostumeDesignImages(designId)` — for the cap check.
- `addCostumeDesignImage(designId, storagePath)` — insert, return row.
- `deleteCostumeDesignImage(designId, id)` — delete by id scoped to design,
  return the `storage_path` (for storage cleanup), or null.

Unit-tested with the chained-`supabaseAdmin`-mock pattern used by
`role-images.test.ts`.

## Org guard — `src/lib/data/production-access.ts`

Add `assertDesignInProduction(productionId, designId)`: confirm the design's role
belongs to the production (join `costume_designs` → `roles.production_id`, or
resolve the design's `role_id` then reuse `assertRoleInProduction`). Throws
`NotFoundError` otherwise. Mirrors `assertRoleInProduction`/`assertCastingInProduction`.

## API routes

Mirror the role-images routes, with the cap at **6**:

- `src/app/api/productions/[id]/designs/[designId]/images/route.ts`
  - `GET` → `assertProductionInOrg` + `assertDesignInProduction`, list images,
    return `{ images: [{ id, url }] }` with signed URLs.
  - `POST` → same guards; reject when `countCostumeDesignImages >= 6` with a
    `ValidationError("Up to 6 photos per piece")`; validate the uploaded file is
    an image; upload the bytes to
    `${id}/designs/${designId}/${crypto.randomUUID()}.jpg`; insert row; return
    `{ image: { id } }` (201). (Compression happens client-side in the photo
    component before upload, same as roles — the route just stores the bytes.)
- `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts`
  - `DELETE` → guards; delete the row; remove the storage object.

Route-tested mirroring `images/route.test.ts` (success, cap → 400, cross-
production → 404).

## UI

- **`src/components/PhotoStrip.tsx`** — generic version of `RolePhotos`, props
  `{ endpoint: string; max: number }`. Owns fetch/list/upload/compress/delete/
  lightbox + the add button gated by `max`. Endpoint contract: `GET → { images:
  [{id,url}] }`, `POST` multipart `file`, `DELETE endpoint/{imageId}`.
- **`src/components/RolePhotos.tsx`** — refactor to render
  `<PhotoStrip endpoint={…/roles/${roleId}/images} max={6} />`. Behavior
  unchanged; verify the role Ideas/Notes tab still works.
- **`src/components/RoleCostumePanel.tsx`** — in the Pieces section, render each
  piece with its name + a `<PhotoStrip endpoint={…/designs/${d.id}/images}
  max={6} />`. Lay pieces out so each has room for a small thumbnail row (a row
  per piece rather than tight chips).

## Testing

- `src/lib/data/costume-design-images.test.ts` — list/count/add/delete (mock
  pattern from `role-images.test.ts`).
- `…/designs/[designId]/images/route.test.ts` — GET/POST (201, cap 400,
  cross-production 404), mocking auth/access/data/storage.
- `production-access` guard: add a test if the file has tests for the sibling
  guards; otherwise covered via the route tests.
- `PhotoStrip` / `RoleCostumePanel` / `RolePhotos` wrapper — `npx tsc --noEmit`,
  `npm run lint`, manual check (role photos still work; piece photos upload/show/
  delete).

## Affected / New Files

- New: `supabase/migrations/0012_costume_design_images.sql`
- New: `src/lib/data/costume-design-images.ts` (+ test)
- New: `src/app/api/productions/[id]/designs/[designId]/images/route.ts` (+ test)
- New: `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts`
- New: `src/components/PhotoStrip.tsx`
- Modified: `src/lib/storage.ts` (generic helpers)
- Modified: `src/lib/data/production-access.ts` (`assertDesignInProduction`)
- Modified: `src/components/RolePhotos.tsx` (wrap `PhotoStrip`)
- Modified: `src/components/RoleCostumePanel.tsx` (piece photos in Pieces area)
- Modified: `src/app/productions/[id]/page.tsx` (load design images for the role)

## Out of Scope

- Per-performer piece photos.
- Photos in the tailor's-summary make rows (separate, if wanted later).
- Inventory library (backlog item 4).
