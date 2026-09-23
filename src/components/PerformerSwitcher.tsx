"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { usePendingSaves } from "@/components/PendingSaves";
import {
  PERFORMER_ORDER_MODES,
  neighbors,
  orderPerformers,
  type PerformerOrderMode,
  type SwitcherPerformer,
} from "@/lib/performer-order";

const MODE_KEY = "performerSwitcher.order";
const SKIP_KEY = "performerSwitcher.skipComplete";

// Session fallback so the controls still work when storage is blocked (they just aren't remembered).
const memoryPrefs = new Map<string, string>();

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memoryPrefs.get(key) ?? null;
  } catch {
    return memoryPrefs.get(key) ?? null;
  }
}

const PREF_EVENT = "performerSwitcher.pref";

function writePref(key: string, value: string) {
  memoryPrefs.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

function subscribePrefs(onChange: () => void) {
  window.addEventListener(PREF_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREF_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// A remembered choice, or the fallback on the server and when storage is unavailable.
function usePref(key: string, fallback: string): string {
  return useSyncExternalStore(subscribePrefs, () => readPref(key) ?? fallback, () => fallback);
}

// Sticky Prev / Next bar on a performer's measurement page, for measuring a group in one
// sitting. The order and "skip fully measured" choice are remembered on this device.
export function PerformerSwitcher({
  productionId,
  currentId,
  performers,
  roleOrder,
  total,
  fromSummary,
}: {
  productionId: string;
  currentId: string;
  performers: SwitcherPerformer[];
  roleOrder: string[];
  total: number;
  fromSummary: boolean;
}) {
  const router = useRouter();
  const pendingSaves = usePendingSaves();
  const storedMode = usePref(MODE_KEY, "role");
  const mode: PerformerOrderMode = PERFORMER_ORDER_MODES.some((o) => o.value === storedMode)
    ? (storedMode as PerformerOrderMode)
    : "role";
  const skipComplete = usePref(SKIP_KEY, "0") === "1";
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const ordered = useMemo(() => orderPerformers(performers, mode, roleOrder), [performers, mode, roleOrder]);
  const { prev, next } = neighbors(ordered, currentId, { skipComplete, total });
  const position = ordered.findIndex((p) => p.id === currentId) + 1;
  const current = ordered[position - 1];

  async function go(id: string) {
    setOpen(false);
    setNavigating(true);
    await pendingSaves.settle(); // don't leave while a field is still saving
    router.push(`/productions/${productionId}/performers/${id}${fromSummary ? "?from=summary" : ""}`);
  }

  if (performers.length < 2 || !current) return null;

  return (
    <div className="sticky top-0 z-20 -mx-6 mb-4 border-b border-[var(--field-line)] bg-[var(--bg)]/95 px-6 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost shrink-0 !px-3"
          disabled={!prev || navigating}
          onClick={() => prev && go(prev)}
          aria-label="Previous performer"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-center text-sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="font-medium">{current.label}</span>{" "}
          <span className="muted">
            {position} of {ordered.length} ▾
          </span>
        </button>
        <button
          type="button"
          className="btn-primary shrink-0 !px-3"
          disabled={!next || navigating}
          onClick={() => next && go(next)}
          aria-label="Next performer"
        >
          Next ›
        </button>
      </div>

      {open && (
        <div className="surface mt-2 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5 muted">
              Order
              <select
                className="field !p-1.5 text-sm"
                value={mode}
                onChange={(e) => writePref(MODE_KEY, e.target.value)}
              >
                {PERFORMER_ORDER_MODES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={skipComplete}
                onChange={(e) => writePref(SKIP_KEY, e.target.checked ? "1" : "0")}
              />
              Skip anyone fully measured
            </label>
          </div>
          <ul className="mt-3 max-h-72 overflow-y-auto border-t border-[var(--field-line)]">
            {ordered.map((p) => {
              const complete = p.filled >= total;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 border-b border-[var(--field-line)] py-2 text-left ${
                      p.id === currentId ? "font-semibold" : ""
                    }`}
                    onClick={() => (p.id === currentId ? setOpen(false) : go(p.id))}
                    disabled={navigating}
                    aria-current={p.id === currentId ? "page" : undefined}
                  >
                    <span className="truncate">{p.label}</span>
                    <span className={`shrink-0 text-sm ${complete ? "" : "muted"}`}>
                      {complete ? "✓ " : ""}
                      {p.filled}/{total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
