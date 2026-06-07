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
    // Lazy load on mount (Ideas tab open) — intentional load-from-server effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
