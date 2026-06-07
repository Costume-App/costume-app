# Role Photos (Ideas & Notes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload up to 4 compressed reference photos per role in the Ideas & Notes tab, stored in a private Supabase bucket and shown as thumbnails with click-to-enlarge.

**Architecture:** A private `role-images` bucket + `role_images` table. Client compresses to 800px JPEG via canvas; uploads go through a Clerk-authed API route (service-role upload). Display uses batched signed URLs fetched lazily when the Ideas tab opens. A `RolePhotos` client component renders above the notes field.

**Tech Stack:** Next.js 16 (App Router, `request.formData()`), TypeScript strict, Supabase Storage + Postgres, Clerk, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-role-photos-design.md`

**Conventions:** data fns throw `ValidationError`/`NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data/storage → JSON via `errorResponse`. Vitest = node env; chained Supabase mocks via `vi.fn()`.

---

## Task 1: Migration `0010_role_images.sql` + bucket

**Files:** Create `supabase/migrations/0010_role_images.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Reference photos per role (fabric / piece ideas). Objects live in the
-- private "role-images" Storage bucket; this table tracks their paths.
create table if not exists role_images (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references roles(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists role_images_role_id_idx on role_images(role_id);
```

- [ ] **Step 2: Commit (Chris does the two manual Supabase steps)**

```bash
git add supabase/migrations/0010_role_images.sql
git commit -m "feat: 0010 role_images table"
```

> **MANUAL STEPS (Chris):** (1) In the Supabase dashboard → Storage, create a **private** bucket named `role-images`. (2) Run `0010_role_images.sql` in the SQL editor. Photos won't work until both are done; the rest of the app is unaffected.

---

## Task 2: `fitWithinMax` pure helper

**Files:**
- Create: `src/lib/image-fit.ts`
- Test: `src/lib/image-fit.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { fitWithinMax } from "@/lib/image-fit";

test("landscape scales by width", () => {
  expect(fitWithinMax(2000, 1000, 800)).toEqual({ width: 800, height: 400 });
});

test("portrait scales by height", () => {
  expect(fitWithinMax(1000, 2000, 800)).toEqual({ width: 400, height: 800 });
});

test("square scales both", () => {
  expect(fitWithinMax(1600, 1600, 800)).toEqual({ width: 800, height: 800 });
});

test("does not upscale smaller images", () => {
  expect(fitWithinMax(500, 300, 800)).toEqual({ width: 500, height: 300 });
});
```

- [ ] **Step 2: Run → fail.** `npm test -- image-fit` (module missing).

- [ ] **Step 3: Implement `src/lib/image-fit.ts`**

```typescript
// Scale (width, height) so the longest side is at most `max`, preserving aspect
// ratio. Never upscales. Returns integer dimensions.
export function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 4: Run → pass.** `npm test -- image-fit` (4 pass).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/image-fit.ts src/lib/image-fit.test.ts
git commit -m "feat: fitWithinMax image-dimension helper"
```

---

## Task 3: Storage helper

**Files:** Create `src/lib/storage.ts`

(No unit test — thin wrapper over `supabaseAdmin.storage`; covered via route tests where it's mocked.)

- [ ] **Step 1: Create `src/lib/storage.ts`**

```typescript
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ROLE_IMAGES_BUCKET = "role-images";

export async function uploadRoleImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(ROLE_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
}

// Map each path to a short-lived signed URL. Empty input → {}.
export async function signRoleImageUrls(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
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

export async function removeRoleImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
}
```

- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit` (clean).
```bash
git add src/lib/storage.ts
git commit -m "feat: role-images storage helpers (upload/sign/remove)"
```

---

## Task 4: `role-images` data layer

**Files:**
- Create: `src/lib/data/role-images.ts`
- Test: `src/lib/data/role-images.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const eqList = vi.fn(() => ({ order }));
const selectList = vi.fn(() => ({ eq: eqList }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const maybeSingle = vi.fn();
const delSelect = vi.fn(() => ({ maybeSingle }));
const delEq2 = vi.fn(() => ({ select: delSelect }));
const delEq1 = vi.fn(() => ({ eq: delEq2 }));
const del = vi.fn(() => ({ eq: delEq1 }));
const from = vi.fn((_t: string) => ({ select: selectList, insert, delete: del }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { listRoleImages, addRoleImage, deleteRoleImage } from "@/lib/data/role-images";

beforeEach(() => {
  [order, eqList, selectList, single, insertSelect, insert, maybeSingle, delSelect, delEq2, delEq1, del, from].forEach((m) => m.mockReset());
  eqList.mockReturnValue({ order });
  selectList.mockReturnValue({ eq: eqList });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  delSelect.mockReturnValue({ maybeSingle });
  delEq2.mockReturnValue({ select: delSelect });
  delEq1.mockReturnValue({ eq: delEq2 });
  del.mockReturnValue({ eq: delEq1 });
  from.mockReturnValue({ select: selectList, insert, delete: del });
});

test("listRoleImages queries by role_id ordered by created_at", async () => {
  order.mockResolvedValue({ data: [{ id: "i1", role_id: "r1", storage_path: "p/q.jpg" }], error: null });
  const rows = await listRoleImages("r1");
  expect(from).toHaveBeenCalledWith("role_images");
  expect(eqList).toHaveBeenCalledWith("role_id", "r1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "i1", role_id: "r1", storage_path: "p/q.jpg" }]);
});

test("addRoleImage inserts role_id + storage_path and returns the row", async () => {
  single.mockResolvedValue({ data: { id: "i2", role_id: "r1", storage_path: "p/x.jpg" }, error: null });
  const row = await addRoleImage("r1", "p/x.jpg");
  expect(insert).toHaveBeenCalledWith({ role_id: "r1", storage_path: "p/x.jpg" });
  expect(row).toEqual({ id: "i2", role_id: "r1", storage_path: "p/x.jpg" });
});

test("deleteRoleImage deletes scoped by id+role_id and returns the storage_path", async () => {
  maybeSingle.mockResolvedValue({ data: { storage_path: "p/x.jpg" }, error: null });
  const path = await deleteRoleImage("r1", "i2");
  expect(delEq1).toHaveBeenCalledWith("id", "i2");
  expect(delEq2).toHaveBeenCalledWith("role_id", "r1");
  expect(path).toBe("p/x.jpg");
});

test("deleteRoleImage returns null when nothing matched", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await deleteRoleImage("r1", "nope")).toBeNull();
});
```

- [ ] **Step 2: Run → fail.** `npm test -- role-images` (module missing).

- [ ] **Step 3: Implement `src/lib/data/role-images.ts`**

```typescript
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface RoleImage {
  id: string;
  role_id: string;
  storage_path: string;
  created_at: string;
}

export async function listRoleImages(roleId: string): Promise<RoleImage[]> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .select("*")
    .eq("role_id", roleId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleImage[];
}

export async function addRoleImage(roleId: string, storagePath: string): Promise<RoleImage> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .insert({ role_id: roleId, storage_path: storagePath })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RoleImage;
}

export async function deleteRoleImage(roleId: string, id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("role_images")
    .delete()
    .eq("id", id)
    .eq("role_id", roleId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoleImage | null)?.storage_path ?? null;
}
```

- [ ] **Step 4: Run → pass.** `npm test -- role-images`.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/data/role-images.ts src/lib/data/role-images.test.ts
git commit -m "feat: role-images data layer (list/add/delete)"
```

---

## Task 5: GET + POST images route

**Files:**
- Create: `src/app/api/productions/[id]/roles/[roleId]/images/route.ts`
- Test: `src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { listRoleImages, addRoleImage } from "@/lib/data/role-images";
import { uploadRoleImage, signRoleImageUrls } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

const MAX_PER_ROLE = 4;

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    const images = await listRoleImages(roleId);
    const urls = await signRoleImageUrls(images.map((i) => i.storage_path));
    return NextResponse.json({ images: images.map((i) => ({ id: i.id, url: urls[i.storage_path] ?? null })) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    const existing = await listRoleImages(roleId);
    if (existing.length >= MAX_PER_ROLE) {
      throw new ValidationError(`Up to ${MAX_PER_ROLE} photos per role`);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file provided");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${id}/${roleId}/${crypto.randomUUID()}.jpg`;
    await uploadRoleImage(path, bytes);
    const image = await addRoleImage(roleId, path);
    return NextResponse.json({ image: { id: image.id } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Write the test**

```typescript
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const listRoleImages = vi.fn();
const addRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  listRoleImages: (...a: unknown[]) => listRoleImages(...a),
  addRoleImage: (...a: unknown[]) => addRoleImage(...a),
}));

const uploadRoleImage = vi.fn();
const signRoleImageUrls = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadRoleImage: (...a: unknown[]) => uploadRoleImage(...a),
  signRoleImageUrls: (...a: unknown[]) => signRoleImageUrls(...a),
}));

import { GET, POST } from "@/app/api/productions/[id]/roles/[roleId]/images/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, listRoleImages, addRoleImage, uploadRoleImage, signRoleImageUrls].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, roleId: string) => ({ params: Promise.resolve({ id, roleId }) });

function postReq() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }));
  return new Request("http://test", { method: "POST", body: form });
}

test("GET returns images with signed urls", async () => {
  listRoleImages.mockResolvedValue([{ id: "i1", storage_path: "p1/r1/a.jpg" }]);
  signRoleImageUrls.mockResolvedValue({ "p1/r1/a.jpg": "https://signed/a" });
  const res = await GET(new Request("http://test"), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ images: [{ id: "i1", url: "https://signed/a" }] });
});

test("POST uploads and records an image (201)", async () => {
  listRoleImages.mockResolvedValue([]);
  uploadRoleImage.mockResolvedValue(undefined);
  addRoleImage.mockResolvedValue({ id: "i9" });
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ image: { id: "i9" } });
  expect(uploadRoleImage).toHaveBeenCalled();
  expect(addRoleImage).toHaveBeenCalled();
});

test("POST 400 when already at the 4-photo cap", async () => {
  listRoleImages.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(400);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 3: Run + tsc.** `npm test -- "roles/[roleId]/images"` then `npx tsc --noEmit`.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/api/productions/[id]/roles/[roleId]/images/route.ts" "src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts"
git commit -m "feat: role images GET (signed urls) + POST (upload, cap 4)"
```

---

## Task 6: DELETE image route

**Files:**
- Create: `src/app/api/productions/[id]/roles/[roleId]/images/[imageId]/route.ts`
- Test: `src/app/api/productions/[id]/roles/[roleId]/images/[imageId]/route.test.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { deleteRoleImage } from "@/lib/data/role-images";
import { removeRoleImages } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; roleId: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId, imageId } = await params;
    await assertProductionInOrg(orgId, id);
    const path = await deleteRoleImage(roleId, imageId);
    if (path) await removeRoleImages([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Write the test**

```typescript
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const deleteRoleImage = vi.fn();
vi.mock("@/lib/data/role-images", () => ({
  deleteRoleImage: (...a: unknown[]) => deleteRoleImage(...a),
}));

const removeRoleImages = vi.fn();
vi.mock("@/lib/storage", () => ({
  removeRoleImages: (...a: unknown[]) => removeRoleImages(...a),
}));

import { DELETE } from "@/app/api/productions/[id]/roles/[roleId]/images/[imageId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteRoleImage, removeRoleImages].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, roleId: string, imageId: string) => ({ params: Promise.resolve({ id, roleId, imageId }) });
const req = () => new Request("http://test", { method: "DELETE" });

test("DELETE removes the row and the storage object (200)", async () => {
  deleteRoleImage.mockResolvedValue("p1/r1/a.jpg");
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(200);
  expect(deleteRoleImage).toHaveBeenCalledWith("r1", "i1");
  expect(removeRoleImages).toHaveBeenCalledWith(["p1/r1/a.jpg"]);
});

test("DELETE skips storage remove when nothing matched", async () => {
  deleteRoleImage.mockResolvedValue(null);
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(200);
  expect(removeRoleImages).not.toHaveBeenCalled();
});

test("DELETE 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await DELETE(req(), ctx("p1", "r1", "i1"));
  expect(res.status).toBe(404);
  expect(deleteRoleImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run + tsc.** `npm test -- images` then `npx tsc --noEmit` (clean).

- [ ] **Step 4: Commit.**
```bash
git add "src/app/api/productions/[id]/roles/[roleId]/images/[imageId]"
git commit -m "feat: DELETE role image (row + storage object)"
```

---

## Task 7: Client image compression

**Files:** Create `src/lib/compress-image.ts`

(Browser-only canvas — manual-smoke; the dimension math is already covered by `fitWithinMax`.)

- [ ] **Step 1: Create `src/lib/compress-image.ts`**

```typescript
import { fitWithinMax } from "@/lib/image-fit";

// Resize an image File to <=`max`px on the longest side and re-encode as JPEG.
export async function compressImage(file: File, max = 800, quality = 0.7): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the image"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load the image"));
    el.src = dataUrl;
  });
  const { width, height } = fitWithinMax(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing isn't supported here");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process the image");
  return blob;
}
```

- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit`.
```bash
git add src/lib/compress-image.ts
git commit -m "feat: client-side image compression to 800px JPEG"
```

---

## Task 8: `RolePhotos` component

**Files:** Create `src/components/RolePhotos.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compress-image";

interface RoleImageView {
  id: string;
  url: string | null;
}

const MAX_PER_ROLE = 4;

export function RolePhotos({ productionId, roleId }: { productionId: string; roleId: string }) {
  const [images, setImages] = useState<RoleImageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/productions/${productionId}/roles/${roleId}/images`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { images: RoleImageView[] };
      setImages(data.images);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionId, roleId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append("file", blob, "photo.jpg");
      const res = await fetch(`/api/productions/${productionId}/roles/${roleId}/images`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't upload photo");
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload photo");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles/${roleId}/images/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setError("Couldn't remove photo");
    } else {
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-1">
      <span className="lbl block">Photos</span>
      <div className="flex flex-wrap items-center gap-2">
        {images.map((img) => (
          <div key={img.id} className="relative">
            {img.url ? (
              <button type="button" onClick={() => setEnlarged(img.url)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="Role reference" className="h-[72px] w-[72px] rounded object-cover" />
              </button>
            ) : (
              <div className="h-[72px] w-[72px] rounded bg-[var(--bg)]" />
            )}
            <button
              type="button"
              onClick={() => remove(img.id)}
              disabled={busy}
              aria-label="Remove photo"
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--red)] text-xs leading-none text-[var(--red-fg)] disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        {images.length < MAX_PER_ROLE && (
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
          <img src={enlarged} alt="Role reference" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit`, `npm run lint` (no new errors).
```bash
git add src/components/RolePhotos.tsx
git commit -m "feat: RolePhotos gallery (upload/thumbnails/enlarge/remove, cap 4)"
```

---

## Task 9: Wire `RolePhotos` above the notes

**Files:** Modify `src/components/RoleNotesPanel.tsx`

- [ ] **Step 1: Import + render above the notes**

1. Add the import after the React import:
```typescript
import { RolePhotos } from "@/components/RolePhotos";
```
2. The component currently returns a single `<div className="space-y-1"> … notes … </div>`. Wrap the panel so photos sit above the notes block. Change the top of the returned JSX from:
```tsx
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="lbl">Notes</span>
```
to:
```tsx
  return (
    <div className="space-y-3">
      <RolePhotos productionId={productionId} roleId={roleId} />
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="lbl">Notes</span>
```
…and add a matching closing `</div>` for the new wrapper: the existing outer `</div>` at the end of the return now closes the inner notes block, so add one more `</div>` before it. (Read the file and place the extra closing div so the structure is: outer `space-y-3` → `<RolePhotos/>` + notes `space-y-1` div.)

- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npm test` (green).
```bash
git add src/components/RoleNotesPanel.tsx
git commit -m "feat: show role photos above the notes field"
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Suite + types + lint.** `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (no new errors; pre-existing warnings + the `no-img-element` disables are fine).

- [ ] **Step 2: Manual smoke (after Chris creates the bucket + runs 0010).**
- Open a role's Ideas & Notes tab → Photos section appears above Notes.
- Add a large phone photo → it compresses and uploads, thumbnail appears.
- Add up to 4 → the "+" disappears at 4.
- Click a thumbnail → enlarge modal; click backdrop → closes.
- Remove a photo → it disappears; the "+" returns.
- Reopen the tab (or navigate away and back) → photos reload via fresh signed URLs.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** role_images table + bucket (T1); fitWithinMax (T2); storage helpers (T3); data layer (T4); GET signed + POST upload/cap (T5); DELETE row+object (T6); compressImage (T7); RolePhotos gallery+enlarge+cap (T8); placed above notes (T9). All mapped.
- **Cap enforced twice:** API (`existing.length >= 4` in POST) and UI (`+` hidden at 4).
- **Private + lazy signed URLs:** GET signs on demand; `RolePhotos` fetches on mount (Ideas tab open only). No detail-page-load impact.
- **Type consistency:** `RoleImage {id, role_id, storage_path, created_at}`; storage helpers (`uploadRoleImage(path, bytes)`, `signRoleImageUrls(paths)→Record`, `removeRoleImages(paths)`); route GET returns `{images:[{id,url}]}` consumed by `RolePhotos`. Consistent.
- **No real canvas in tests:** compression is manual-smoke; `fitWithinMax` carries the unit-tested math.
