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
  readOnly = false,
}: {
  endpoint: string;
  max: number;
  label?: string;
  readOnly?: boolean;
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
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--red)] text-xs leading-none text-[var(--red-fg)] disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </div>
            <span className="text-xs muted">#{i + 1}</span>
          </div>
        ))}
        {!readOnly && images.length < max && (
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
