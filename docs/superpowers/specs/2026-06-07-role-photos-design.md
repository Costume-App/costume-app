# Role Photos (Ideas & Notes) — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Part of:** the workspace redesign — the photo half of the Ideas & Notes tab. Last remaining piece of that effort.

## Problem

Users want to attach fabric / piece reference photos to a role, in the Ideas & Notes tab, to track ideas under consideration. No image/storage capability exists in the app yet.

## Goal

In a role's **Ideas & Notes** tab, **above** the notes field, a **Photos** section: upload up to **4** reference photos per role, shown as small thumbnails, tap to enlarge; remove individually. Photos are compressed client-side before upload and stored privately.

## Decisions (locked)

- **One stored version** per photo: resized to **800px** longest side, JPEG **~0.7** (~80–150 KB). Thumbnails are CSS-rendered from that single file; enlarge shows the same 800px file. No second size.
- **Cap: 4 photos per role** — enforced in UI and API.
- **Private bucket** + **lazy, batched signed URLs** (minted when the Ideas tab opens). No impact on detail-page load; URLs always fresh.

## Manual setup (Chris, one-time)

Create a **private** Storage bucket named `role-images` in the Supabase dashboard. Flagged like a migration; uploads fail until it exists.

## Data model

Migration `supabase/migrations/0010_role_images.sql`:
```sql
create table if not exists role_images (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references roles(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists role_images_role_id_idx on role_images(role_id);
```
Object path convention: `{productionId}/{roleId}/{uuid}.jpg`. (DB rows are removed by cascade when a role/production is deleted; the Storage objects are best-effort cleaned by the delete route — orphaned objects are harmless and bounded.)

## Components / changes

### Storage helper — `src/lib/storage.ts`

Thin wrapper over `supabaseAdmin.storage` so storage concerns live in one place and are mockable:
- `ROLE_IMAGES_BUCKET = "role-images"`.
- `uploadRoleImage(path, bytes: Uint8Array)` → `upload(path, bytes, { contentType: "image/jpeg", upsert: false })`; throw on error.
- `signRoleImageUrls(paths: string[], expiresIn = 3600)` → `createSignedUrls(...)`; returns `Record<path, signedUrl>` (empty input → `{}`).
- `removeRoleImages(paths: string[])` → `remove(paths)` (best-effort).

### Data layer — `src/lib/data/role-images.ts`

- `RoleImage { id; role_id; storage_path; created_at }`.
- `listRoleImages(roleId)` → rows ordered by `created_at`.
- `countRoleImages(roleId)` → number.
- `addRoleImage(roleId, storagePath)` → insert, return row.
- `deleteRoleImage(roleId, id)` → delete scoped by `id`+`role_id`, return the deleted row's `storage_path` (or null) so the route can remove the object.

### Pure helper — `src/lib/image-fit.ts`

`fitWithinMax(width, height, max)` → `{ width, height }` scaled so the longest side ≤ `max`, preserving aspect ratio (no upscaling). Unit-tested.

### Client compression — `src/lib/compress-image.ts`

`compressImage(file: File, max = 800, quality = 0.7): Promise<Blob>` — load into an `Image`, draw onto a canvas sized via `fitWithinMax`, `canvas.toBlob("image/jpeg", quality)`. (Browser-only; manual-smoke — jsdom has no real canvas.)

### API — `src/app/api/productions/[id]/roles/[roleId]/images/route.ts`

- `GET` → auth → `assertProductionInOrg` → `listRoleImages(roleId)` → `signRoleImageUrls` for their paths → `{ images: [{ id, url }] }`.
- `POST` (multipart) → auth → `assertProductionInOrg` → if `countRoleImages(roleId) >= 4` → `ValidationError("Up to 4 photos per role")` (400); else read `request.formData()` file → bytes → path `{id}/{roleId}/{crypto.randomUUID()}.jpg` → `uploadRoleImage` → `addRoleImage` → `{ image: { id } }`.

### API — `…/images/[imageId]/route.ts`

- `DELETE` → auth → `assertProductionInOrg` → `deleteRoleImage(roleId, imageId)` → if a path came back, `removeRoleImages([path])` → `{ ok: true }`.

### UI — `src/components/RolePhotos.tsx` (new client component)

Props `{ productionId, roleId }`. On mount, `GET` the images (lazy — the component only mounts when the Ideas tab is active). Renders:
- A **Photos** label + a row of **72px** thumbnails (`object-cover`, rounded), each with a remove ×.
- An **Add photo** control (file input, `accept="image/*"`) shown when count < 4: on pick → `compressImage` → `POST` (FormData) → re-`GET` to refresh.
- Click a thumbnail → an **enlarge modal** (dim backdrop, the 800px image, click/Esc to close).
- `busy`/`error` states; the existing in-flight guard pattern.

### `RoleNotesPanel.tsx`

Render `<RolePhotos productionId={productionId} roleId={roleId} />` **above** the existing notes label + textarea.

## Error handling

- Over cap → 400, surfaced inline; Add hidden at 4 anyway.
- Non-image / failed compression → inline error, no upload.
- Upload/sign/delete failures → inline error; storage object orphans on partial failure are harmless.
- Cross-org / missing → 404 via `assertProductionInOrg`.

## Testing

- `fitWithinMax` (landscape/portrait/square, no upscaling, max respected).
- `role-images` data layer (list ordered, count, add, delete returns path) with the chained-mock pattern.
- Routes: `GET` returns signed-url shape; `POST` 400 at cap (count ≥ 4) and 201 below; `DELETE` removes row + calls storage remove; 404 cross-org. Storage helper mocked.
- `compressImage` + the modal/upload UI — manual smoke.

## Migration / demo dependency

Two manual steps before photos work: create the private `role-images` bucket, and apply `0010_role_images.sql`.
