"use client";

import { useEffect, useState } from "react";

export interface RolePhoto {
  id: string;
  url: string | null;
}

// Read-only reference photos for a role (managed on the role's Ideas tab).
// Click a thumbnail to enlarge; Escape or click closes it.
export function RolePhotoStrip({ images }: { images: RolePhoto[] }) {
  const [enlarged, setEnlarged] = useState<string | null>(null);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEnlarged(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enlarged]);

  const shown = images.filter((i) => i.url);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((img, i) => (
        <button key={img.id} type="button" onClick={() => setEnlarged(img.url)} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url as string}
            alt={`Reference ${i + 1}`}
            className="h-[60px] w-[60px] rounded object-cover"
          />
        </button>
      ))}
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
