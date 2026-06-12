"use client";

import { useEffect, useRef, useState } from "react";

// Shared "Saved ✓" feedback for fields that auto-save on blur.
// `useSavedFlash` gives you a transient flag + a trigger; `<SavedFlash>` renders
// the green indicator (reserved opacity fade, so it never shifts layout).

export function useSavedFlash(ms = 1500) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function flashSaved() {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), ms);
  }
  return { saved, flashSaved };
}

export function SavedFlash({ saved, className = "" }: { saved: boolean; className?: string }) {
  return (
    <span
      aria-live="polite"
      className={`text-xs text-[var(--green)] transition-opacity duration-300 ${saved ? "opacity-100" : "opacity-0"} ${className}`}
    >
      Saved ✓
    </span>
  );
}
