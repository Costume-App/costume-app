# nada-costume

Costume-planning app for school/theater productions (Next.js 16, TypeScript, Supabase, Clerk, Tailwind 4).

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in Clerk + Supabase keys.
3. Apply the SQL migrations in `supabase/migrations/` **in order** (Supabase dashboard → SQL editor).
4. Create the Storage bucket (see below).
5. `npm run dev`

## Supabase Storage: `role-images` bucket

Role reference photos (Ideas & Notes tab) are stored in a Storage bucket. Create it once in the Supabase dashboard → **Storage → New bucket**:

| Setting | Value | Why |
|---|---|---|
| **Name** | `role-images` | Must match `ROLE_IMAGES_BUCKET` in `src/lib/storage.ts`. |
| **Public** | **Off (private)** | Images are org data; the app serves them via short-lived signed URLs. |
| **Allowed MIME types** | `image/jpeg` | The app compresses + re-encodes every upload to JPEG, so JPEG-only is the tightest correct list. |
| **File size limit** | `2 MB` | Backstop — real uploads are ~80–150 KB after client-side compression. |

These bucket-level limits are enforced for every upload (including the service-role key the API uses), so they back up the route's own checks (`image/*` MIME guard, ≤4 photos per role) and the client-side compression.

Uploads go through `POST /api/productions/[id]/roles/[roleId]/images` (Clerk-authed, org-scoped); display uses batched signed URLs minted on demand.

## Tests

`npm test` (vitest) · `npm run lint` · `npx tsc --noEmit`
