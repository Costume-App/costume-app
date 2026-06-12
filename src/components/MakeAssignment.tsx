"use client";

import { castColorHex } from "@/lib/cast-colors";

export interface MakerOption {
  id: string;
  name: string;
  color: string;
}

// Maker selector (with the maker's colour dot) + an optional "Made" toggle.
// Presentational: persistence is the parent's job.
export function MakeAssignment({
  makers,
  makerId,
  made,
  showMade = true,
  madeLabel = "Made",
  busy = false,
  onChangeMaker,
  onToggleMade,
}: {
  makers: MakerOption[];
  makerId: string | null;
  made: boolean;
  showMade?: boolean;
  madeLabel?: string;
  busy?: boolean;
  onChangeMaker: (makerId: string | null) => void;
  onToggleMade?: (made: boolean) => void;
}) {
  const selected = makers.find((m) => m.id === makerId) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5">
        {selected && (
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: castColorHex(selected.color) }}
          />
        )}
        <select
          className="field !p-1.5 text-sm"
          value={makerId ?? ""}
          disabled={busy}
          onChange={(e) => onChangeMaker(e.target.value || null)}
          aria-label="Maker"
        >
          <option value="">Unassigned</option>
          {makers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </span>
      {showMade && (
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={made}
            disabled={busy}
            onChange={(e) => onToggleMade?.(e.target.checked)}
            className="h-4 w-4 accent-[var(--red)]"
            aria-label="Made"
            title="Made"
          />
          {madeLabel}
        </label>
      )}
    </div>
  );
}
