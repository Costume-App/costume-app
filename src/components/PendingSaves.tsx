"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PendingSaves {
  track: (save: Promise<unknown>) => void;
  settle: () => Promise<void>;
}

const Ctx = createContext<PendingSaves | null>(null);

// Lets a page wait for in-flight field saves before navigating away. Fields save on blur,
// and tapping a nav button blurs the field first, so the save is always tracked by the
// time the button's click handler calls settle().
export function PendingSavesProvider({ children }: { children: ReactNode }) {
  const [value] = useState<PendingSaves>(() => {
    const pending = new Set<Promise<unknown>>();
    return {
      track(save) {
        pending.add(save);
        save.finally(() => pending.delete(save)).catch(() => {});
      },
      async settle() {
        await Promise.allSettled([...pending]);
      },
    };
  });
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Outside a provider, saves are simply not tracked.
export function usePendingSaves(): PendingSaves {
  return useContext(Ctx) ?? { track: () => {}, settle: async () => {} };
}
