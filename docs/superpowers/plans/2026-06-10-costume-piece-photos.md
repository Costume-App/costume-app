# Photos on Costume Pieces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each costume piece (a `costume_designs` row) carry up to 6 reference photos, managed in the Pieces area of the Costume tab, reusing the role-photo stack.

**Architecture:** New `costume_design_images` table (mirrors `role_images`) + a thin data layer; new API routes mirroring the role-image routes (cap 6) with a new `assertDesignInProduction` org guard; storage helpers generalized to the shared `role-images` bucket; the role photo UI extracted into a generic `PhotoStrip` used by both roles and pieces. Photos attach to the design (shared across the role's performers).

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase (Postgres + Storage), Vitest. `@/*` → `src/*`. **Requires a Supabase migration applied to prod on deploy.**

**Conventions (verified):** data layer mocks `supabaseAdmin` chains; routes mock the data/storage/access modules; access guards (`assertRoleInProduction`, etc.) are NOT unit-tested directly — they're covered via route tests, so `assertDesignInProduction` follows suit. React components verified via tsc/lint/manual. The photo component self-fetches on mount, so no page-load preloading is needed. Spec: `docs/superpowers/specs/2026-06-10-costume-piece-photos-design.md`.

---

## File Structure

- **Create** `supabase/migrations/0012_costume_design_images.sql`
- **Create** `src/lib/data/costume-design-images.ts` (+ `.test.ts`)
- **Modify** `src/lib/data/production-access.ts` (`assertDesignInProduction`)
- **Modify** `src/lib/storage.ts` (generic `uploadImage`/`signImageUrls`/`removeImages`; role names delegate)
- **Create** `src/app/api/productions/[id]/designs/[designId]/images/route.ts` (+ `.test.ts`)
- **Create** `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts`
- **Create** `src/components/PhotoStrip.tsx`
- **Modify** `src/components/RolePhotos.tsx` (wrap `PhotoStrip`)
- **Modify** `src/components/RoleCostumePanel.tsx` (piece photos in the Pieces area)

---

## Task 1: Migration + design-images data layer + org guard

**Files:**
- Create: `supabase/migrations/0012_costume_design_images.sql`
- Create: `src/lib/data/costume-design-images.ts`
- Create: `src/lib/data/costume-design-images.test.ts`
- Modify: `src/lib/data/production-access.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_costume_design_images.sql`:

```sql
-- Reference photos per costume piece (the "design"). Objects live in the shared
-- private "role-images" Storage bucket (under a designs/ path prefix); this table
-- tracks their paths. Mirrors role_images (0010).
create table if not exists costume_design_images (
  id                uuid primary key default gen_random_uuid(),
  costume_design_id uuid not null references costume_designs(id) on delete cascade,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);
create index if not exists costume_design_images_design_id_idx on costume_design_images(costume_design_id);
```

- [ ] **Step 2: Write the failing data-layer test**

Create `src/lib/data/costume-design-images.test.ts` (mirrors `role-images.test.ts`'s chained-mock style):

```ts
import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const countEq = vi.fn();
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const delMaybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle: delMaybeSingle }));
const delEqDesign = vi.fn(() => ({ select: delSelect }));
const delEqId = vi.fn(() => ({ eq: delEqDesign }));
const del = vi.fn(() => ({ eq: delEqId }));
// select() is called three ways: list (.eq -> .order), count (.eq with opts), and not at all for insert/delete chains.
const select = vi.fn((_cols: string, _opts?: unknown) => ({ eq: listEq }));
const from = vi.fn(() => ({ select, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import {
  listCostumeDesignImages,
  countCostumeDesignImages,
  addCostumeDesignImage,
  deleteCostumeDesignImage,
} from "@/lib/data/costume-design-images";

beforeEach(() => {
  [order, listEq, countEq, insertSingle, insertSelect, insert, delMaybeSingle, delSelect, delEqDesign, delEqId, del, select, from].forEach(
    (m) => m.mockReset(),
  );
  listEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle: delMaybeSingle });
  delEqDesign.mockReturnValue({ select: delSelect });
  delEqId.mockReturnValue({ eq: delEqDesign });
  del.mockReturnValue({ eq: delEqId });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del });
});

test("listCostumeDesignImages filters by design, oldest-first", async () => {
  order.mockResolvedValue({ data: [{ id: "i1", costume_design_id: "d1", storage_path: "p", created_at: "t" }], error: null });
  const rows = await listCostumeDesignImages("d1");
  expect(from).toHaveBeenCalledWith("costume_design_images");
  expect(listEq).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", costume_design_id: "d1", storage_path: "p", created_at: "t" }]);
});

test("countCostumeDesignImages returns the exact head count", async () => {
  // count path: select("id", { count: "exact", head: true }).eq(...) -> resolves
  const countEqResolved = vi.fn().mockResolvedValue({ count: 3, error: null });
  select.mockReturnValueOnce({ eq: countEqResolved });
  const n = await countCostumeDesignImages("d1");
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(countEqResolved).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(n).toBe(3);
});

test("addCostumeDesignImage inserts and returns the row", async () => {
  insertSingle.mockResolvedValue({ data: { id: "i9", costume_design_id: "d1", storage_path: "p", created_at: "t" }, error: null });
  const row = await addCostumeDesignImage("d1", "p");
  expect(insert).toHaveBeenCalledWith({ costume_design_id: "d1", storage_path: "p" });
  expect(row.id).toBe("i9");
});

test("deleteCostumeDesignImage deletes by id scoped to the design and returns the path", async () => {
  delMaybeSingle.mockResolvedValue({ data: { storage_path: "p/x.jpg" }, error: null });
  const path = await deleteCostumeDesignImage("d1", "i1");
  expect(delEqId).toHaveBeenCalledWith("id", "i1");
  expect(delEqDesign).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(path).toBe("p/x.jpg");
});

test("deleteCostumeDesignImage returns null when nothing matched", async () => {
  delMaybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteCostumeDesignImage("d1", "nope")).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/data/costume-design-images.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the data layer**

Create `src/lib/data/costume-design-images.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface CostumeDesignImage {
  id: string;
  costume_design_id: string;
  storage_path: string;
  created_at: string;
}

export async function listCostumeDesignImages(designId: string): Promise<CostumeDesignImage[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .select("*")
    .eq("costume_design_id", designId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CostumeDesignImage[];
}

export async function countCostumeDesignImages(designId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("costume_design_images")
    .select("id", { count: "exact", head: true })
    .eq("costume_design_id", designId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function addCostumeDesignImage(designId: string, storagePath: string): Promise<CostumeDesignImage> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .insert({ costume_design_id: designId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CostumeDesignImage;
}

export async function deleteCostumeDesignImage(designId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("costume_design_images")
    .delete()
    .eq("id", id)
    .eq("costume_design_id", designId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CostumeDesignImage | null)?.storage_path ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/data/costume-design-images.test.ts`
Expected: PASS (5 tests). If the `countCostumeDesignImages` test needs a tweak to the mock wiring to resolve, adjust the test mock (not the implementation) so it asserts the documented call and returns 3.

- [ ] **Step 6: Add the org guard**

In `src/lib/data/production-access.ts`, add after `assertRoleInProduction` (it already imports `supabaseAdmin` and `NotFoundError`):

```ts
// Throws NotFoundError unless the costume design (piece) belongs to the given production.
export async function assertDesignInProduction(productionId: string, designId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("id")
    .eq("id", designId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Costume piece not found in this production");
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: zero errors.

```bash
git add supabase/migrations/0012_costume_design_images.sql src/lib/data/costume-design-images.ts src/lib/data/costume-design-images.test.ts src/lib/data/production-access.ts
git commit -m "feat: costume_design_images table, data layer, and org guard"
```

---

## Task 2: Storage generics + design-image API routes

**Files:**
- Modify: `src/lib/storage.ts`
- Create: `src/app/api/productions/[id]/designs/[designId]/images/route.ts`
- Create: `src/app/api/productions/[id]/designs/[designId]/images/route.test.ts`
- Create: `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts`

- [ ] **Step 1: Generalize storage helpers**

Replace the body of `src/lib/storage.ts` with bucket-level generics plus backwards-compatible role aliases (the role routes import `uploadRoleImage`/`signRoleImageUrls`/`removeRoleImages` — keep those names working):

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ROLE_IMAGES_BUCKET = "role-images";

// Role and costume-design images share this private bucket, separated by path
// prefix (roles at `${prod}/${role}/…`, designs at `${prod}/designs/${design}/…`).
export async function uploadImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
}

// Map each path to a short-lived signed URL. Empty input → {}.
export async function signImageUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
}

// Backwards-compatible aliases used by the role-image routes (same bucket).
export const uploadRoleImage = uploadImage;
export const signRoleImageUrls = signImageUrls;
export const removeRoleImages = removeImages;
```

- [ ] **Step 2: Write the failing route test**

Create `src/app/api/productions/[id]/designs/[designId]/images/route.test.ts` (mirrors the role images route test):

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
const assertDesignInProduction = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
  assertDesignInProduction: (...a: unknown[]) => assertDesignInProduction(...a),
}));

const listCostumeDesignImages = vi.fn();
const countCostumeDesignImages = vi.fn();
const addCostumeDesignImage = vi.fn();
vi.mock("@/lib/data/costume-design-images", () => ({
  listCostumeDesignImages: (...a: unknown[]) => listCostumeDesignImages(...a),
  countCostumeDesignImages: (...a: unknown[]) => countCostumeDesignImages(...a),
  addCostumeDesignImage: (...a: unknown[]) => addCostumeDesignImage(...a),
}));

const uploadImage = vi.fn();
const signImageUrls = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadImage: (...a: unknown[]) => uploadImage(...a),
  signImageUrls: (...a: unknown[]) => signImageUrls(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/designs/[designId]/images/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, assertDesignInProduction, listCostumeDesignImages, countCostumeDesignImages, addCostumeDesignImage, uploadImage, signImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  assertDesignInProduction.mockResolvedValue(undefined);
});

const ctx = (id: string, designId: string) => ({ params: Promise.resolve({ id, designId }) });
function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listCostumeDesignImages.mockResolvedValue([{ id: "i1", storage_path: "p1/designs/d1/a.jpg" }]);
  signImageUrls.mockResolvedValue({ "p1/designs/d1/a.jpg": "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx("p1", "d1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  countCostumeDesignImages.mockResolvedValue(0);
  uploadImage.mockResolvedValue(undefined);
  addCostumeDesignImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadImage).toHaveBeenCalled();
  expect(addCostumeDesignImage).toHaveBeenCalled();
});

test("POST 400 when already at the 6-photo cap", async () => {
  countCostumeDesignImages.mockResolvedValue(6);
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(400);
  expect(uploadImage).not.toHaveBeenCalled();
});

test("POST 404 when the design is not in that production", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertDesignInProduction.mockRejectedValue(new NotFoundError("Costume piece not found in this production"));
  const res = await POST(postReq(), ctx("p1", "d1"));
  expect(res.status).toBe(404);
  expect(uploadImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/designs/[designId]/images/route.test.ts"`
Expected: FAIL — route module not found.

- [ ] **Step 4: Write the GET/POST route**

Create `src/app/api/productions/[id]/designs/[designId]/images/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg, assertDesignInProduction } from "@/lib/data/production-access";
import { listCostumeDesignImages, addCostumeDesignImage, countCostumeDesignImages } from "@/lib/data/costume-design-images";
import { uploadImage, signImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; designId: string }> };

const MAX_PER_PIECE = 6;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    const images = await listCostumeDesignImages(designId);
    const urls = await signImageUrls(images.map((i) => i.storage_path));
    return NextResponse.json({
      images: images.map((i) => ({ id: i.id, url: urls[i.storage_path] ?? null })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId } = await params;
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    if ((await countCostumeDesignImages(designId)) >= MAX_PER_PIECE) {
      throw new ValidationError(`Up to ${MAX_PER_PIECE} photos per piece`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    if (!file.type.startsWith("image/")) throw new ValidationError("File must be an image");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${id}/designs/${designId}/${crypto.randomUUID()}.jpg`;
    await uploadImage(path, bytes);
    const image = await addCostumeDesignImage(designId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Write the DELETE route**

Create `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg, assertDesignInProduction } from "@/lib/data/production-access";
import { deleteCostumeDesignImage } from "@/lib/data/costume-design-images";
import { removeImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; designId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, designId, imageId } = await params;
    await assertProductionInOrg(orgId, id);
    await assertDesignInProduction(id, designId);
    const path = await deleteCostumeDesignImage(designId, imageId);
    if (path) await removeImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run "src/app/api/productions/[id]/designs/[designId]/images/route.test.ts" && npx vitest run "src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts" && npx tsc --noEmit`
Expected: design-image route tests PASS (4); the role-image route tests STILL PASS (storage aliases preserved); zero type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts "src/app/api/productions/[id]/designs/[designId]/images/route.ts" "src/app/api/productions/[id]/designs/[designId]/images/route.test.ts" "src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts"
git commit -m "feat: costume design image API routes + generic storage helpers"
```

---

## Task 3: PhotoStrip component + role wrapper + Pieces wiring

**Files:**
- Create: `src/components/PhotoStrip.tsx`
- Modify: `src/components/RolePhotos.tsx`
- Modify: `src/components/RoleCostumePanel.tsx`

No automated test (no React component tests in this repo). Verified via tsc/lint + manual.

- [ ] **Step 1: Create the generic PhotoStrip**

Create `src/components/PhotoStrip.tsx` — this is the current `RolePhotos` body, parameterized by `endpoint` + `max` + optional `label`. Endpoint contract: `GET endpoint → { images: [{id,url}] }`, `POST endpoint` (multipart `file`), `DELETE endpoint/{id}`.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compress-image";

interface ImageView {
  id: string;
  url: string | null;
}

// Reusable photo strip: thumbnails + add (gated by `max`) + delete + lightbox.
// Self-fetches its list from `endpoint` on mount. Used for role reference photos
// and costume-piece photos (different endpoints, same UX).
export function PhotoStrip({
  endpoint,
  max,
  label,
}: {
  endpoint: string;
  max: number;
  label?: string;
}) {
  const [images, setImages] = useState<ImageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  async function load() {
    try {
      const res = await fetch(endpoint, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { images: ImageView[] };
        setImages(data.images);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load photos");
      }
    } catch {
      setError("Couldn't load photos");
    }
  }

  useEffect(() => {
    // Lazy load on mount — intentional load-from-server effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEnlarged(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enlarged]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append("file", blob, "photo.jpg");
      const res = await fetch(endpoint, { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't upload photo");
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload photo");
    }
    setBusy(false);
    inFlight.current = false;
  }

  async function remove(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch(`${endpoint}/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      setError("Couldn't remove photo");
    } else {
      await load();
    }
    setBusy(false);
    inFlight.current = false;
  }

  return (
    <div className="space-y-1">
      {label && <span className="lbl block">{label}</span>}
      <div className="flex flex-wrap items-start gap-2">
        {images.map((img, i) => (
          <div key={img.id} className="flex flex-col items-center gap-0.5">
            <div className="relative">
              {img.url ? (
                <button type="button" onClick={() => setEnlarged(img.url)} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`Reference ${i + 1}`} className="h-[72px] w-[72px] rounded object-cover" />
                </button>
              ) : (
                <div className="h-[72px] w-[72px] rounded bg-[var(--bg)]" />
              )}
              <button
                type="button"
                onClick={() => remove(img.id)}
                disabled={busy}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--red)] text-xs leading-none text-[var(--red-fg)] disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <span className="text-xs muted">#{i + 1}</span>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Add photo"
            className="flex h-[72px] w-[72px] items-center justify-center rounded border border-dashed border-[var(--field-line)] text-2xl leading-none text-[var(--muted)] hover:border-[var(--red)] hover:text-[var(--red)] disabled:opacity-50"
          >
            +
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      </div>
      {busy && <p className="text-xs muted">Working…</p>}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      {enlarged && (
        <div
          onClick={() => setEnlarged(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enlarged} alt="Reference" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Refactor RolePhotos to wrap PhotoStrip**

Replace the entire contents of `src/components/RolePhotos.tsx` with:

```tsx
"use client";

import { PhotoStrip } from "@/components/PhotoStrip";

export function RolePhotos({ productionId, roleId }: { productionId: string; roleId: string }) {
  return (
    <PhotoStrip
      endpoint={`/api/productions/${productionId}/roles/${roleId}/images`}
      max={6}
      label="Photos"
    />
  );
}
```

- [ ] **Step 3: Wire piece photos into the Pieces area**

In `src/components/RoleCostumePanel.tsx`:

(a) Add the import (after the `usePersistentState` import near the top):

```ts
import { PhotoStrip } from "@/components/PhotoStrip";
```

(b) In the returned JSX, immediately after `<PieceEditor designs={roleDesigns} onAdd={addDesign} onRemove={removeDesign} busy={busy} />` (the first child of the outer `<div className="space-y-2">`), insert a per-piece photo section:

```tsx
      {roleDesigns.length > 0 && (
        <div className="space-y-2">
          {roleDesigns.map((d) => (
            <div key={d.id} className="rounded-md border border-[var(--field-line)] p-2">
              <span className="lbl mb-1 block">{d.name}</span>
              <PhotoStrip
                endpoint={`/api/productions/${productionId}/designs/${d.id}/images`}
                max={6}
              />
            </div>
          ))}
        </div>
      )}
```

Leave the rest of the panel (the cast-member rows with source selectors) unchanged.

- [ ] **Step 4: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no NEW lint errors, all tests pass.

- [ ] **Step 5: Manual verification (dev server)**

Run: `npm run dev` (note: the `costume_design_images` table must exist in the connected Supabase project — see deploy note). Verify:
1. Open a role's **Costume** tab → each piece shows a "Photos" strip; upload a photo → it appears; reload → persists; delete works; the 7th upload is blocked at 6.
2. Open a role's **Ideas/Notes** tab → role reference photos still upload/show/delete (regression check on the PhotoStrip refactor).

- [ ] **Step 6: Commit**

```bash
git add src/components/PhotoStrip.tsx src/components/RolePhotos.tsx src/components/RoleCostumePanel.tsx
git commit -m "feat: reference photos per costume piece via shared PhotoStrip"
```

---

## Deploy Note

This feature adds migration `0012_costume_design_images.sql`. Before/at deploy, apply it to the single Supabase project (same flow as 0006–0011). The `role-images` bucket already exists and is reused — no new bucket or policy. Without the table, the design-image GET/POST will 500.

---

## Self-Review Notes

- **Spec coverage:** table+migration, data layer, guard (Task 1); storage generics + routes incl. cap 6 + cross-production 404 (Task 2); shared `PhotoStrip`, role wrapper, Pieces wiring (Task 3). Photos attach to the design (shared). No page-load preload needed (PhotoStrip self-fetches) — intentionally omitted vs the spec's tentative `page.tsx` mention.
- **Type consistency:** `CostumeDesignImage` shape consistent across data layer + routes; storage role aliases keep `uploadRoleImage`/`signRoleImageUrls`/`removeRoleImages` exported so the role routes/tests are untouched; `PhotoStrip` props (`endpoint`, `max`, `label?`) used by both the role wrapper and the Pieces section.
- **Back-compat:** role image routes and tests unchanged; storage aliases verified by re-running the role-image route test in Task 2 Step 6.
- **No placeholders:** every code step has complete code; run steps have exact commands + expected results.
