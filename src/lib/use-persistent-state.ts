import { useEffect, useState } from "react";

// Parse a stored JSON string, falling back to `initial` on null/invalid input.
export function parsePersisted<T>(raw: string | null, initial: T): T {
  if (raw == null) return initial;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

// Like useState, but the value is restored from (and written to) sessionStorage
// under `key`. Initializes to `initial` so SSR and the first client render match
// (no hydration mismatch), then restores on mount. All storage access is guarded
// (Safari private mode throws). The setter accepts a value or an updater fn.
export function usePersistentState<T>(
  key: string,
  initial: T,
): readonly [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      // Restore once on mount. Intentionally a setState-in-effect: lazy-initializing
      // from sessionStorage would diverge from the server render and cause a hydration
      // mismatch, so we render `initial` first, then restore on the client.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw != null) setValue(parsePersisted(raw, initial));
    } catch {
      // ignore — behave like plain useState
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function set(v: T | ((prev: T) => T)) {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return [value, set] as const;
}
