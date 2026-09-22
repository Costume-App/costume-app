// src/components/CombineDuplicatesPanel.tsx
"use client";

import { useState } from "react";
import { assignmentShortTag } from "@/lib/casting-assignment";
import { toCombineRequest, type CombineCounts, type DuplicateGroup } from "@/lib/performer-duplicates";
import type { WorkspaceSnapshot } from "@/lib/cast-import/types";

type MeasureStatus = "none" | "partial" | "complete";

const COMBINE_FAILED = "Couldn't combine right now. Try again.";
const COMBINE_MAYBE_DONE = "The combine may have finished. Reload the page to check before trying again.";

// Review same-name performers and combine the selected groups into one person each.
export function CombineDuplicatesPanel({
  productionId,
  groups,
  roles,
  casts,
  measurementStatus,
  onCombined,
  onClose,
}: {
  productionId: string;
  groups: DuplicateGroup[];
  roles: { id: string; name: string }[];
  casts: { id: string; name: string }[];
  measurementStatus: Record<string, MeasureStatus>;
  onCombined: (workspace: WorkspaceSnapshot, counts: CombineCounts) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.filter((g) => !g.blocked).map((g) => g.key)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "Role";
  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "Cast";
  const showCast = casts.length > 1;
  const request = toCombineRequest(groups, selected);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function combine() {
    if (request.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/performers/combine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groups: request }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        counts?: CombineCounts;
        workspace?: WorkspaceSnapshot;
        error?: string;
        completed?: number;
      };
      if (res.ok && data.counts && data.workspace) {
        onCombined(data.workspace, data.counts); // the parent closes this panel
        return;
      }
      // A 5xx may mean some groups committed before the response failed; a 4xx is a clean
      // rejection whose message says what to do, plus how far a partial batch got.
      if (res.status >= 500) {
        setError(COMBINE_MAYBE_DONE);
      } else if (data.error && data.completed && data.completed > 0) {
        const n = data.completed;
        setError(`${data.error} ${n} name${n === 1 ? "" : "s"} were already combined. Reload to see them.`);
      } else {
        setError(data.error ?? COMBINE_FAILED);
      }
    } catch {
      setError(COMBINE_MAYBE_DONE);
    }
    setBusy(false);
  }

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Combine duplicates</h2>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Close
        </button>
      </div>
      <p className="text-sm muted">
        Each name below was added more than once. Combining keeps one entry per name, moves every
        role onto it, and carries the measurements over. The kept entry&rsquo;s measurements win;
        blanks are filled from the others.
      </p>

      <ul className="space-y-3">
        {groups.map((g) => {
          const checked = selected.has(g.key) && !g.blocked;
          return (
            <li key={g.key} className={`space-y-1 rounded-xl border border-[var(--field-line)] p-3 ${g.blocked ? "opacity-60" : ""}`}>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy || g.blocked !== null}
                  onChange={() => toggle(g.key)}
                  aria-label={`Combine ${g.members[0].name}`}
                />
                <span className="min-w-0 break-words">{g.members[0].name}</span>
              </label>
              <ul className="space-y-0.5 pl-6 text-sm">
                {g.members.map((m) => (
                  <li key={m.performerId} className="flex flex-wrap items-center gap-x-2">
                    <span className="min-w-0 break-words">
                      {m.castings.length === 0
                        ? "No roles"
                        : m.castings
                            .map((c) => `${roleName(c.roleId)}${showCast ? ` · ${castName(c.castId)}` : ""}${assignmentShortTag(c.assignment)}`)
                            .join(", ")}
                    </span>
                    <span className="muted">
                      {measurementStatus[m.performerId] === "complete"
                        ? "measured"
                        : measurementStatus[m.performerId] === "partial"
                          ? "partly measured"
                          : "not measured"}
                    </span>
                    {m.performerId === g.keepId && <span className="chip text-xs">Kept</span>}
                  </li>
                ))}
              </ul>
              {g.blocked && (
                <p className="pl-6 text-xs muted">
                  Cast twice as {roleName(g.blocked.roleId)}
                  {showCast ? ` in ${castName(g.blocked.castId)}` : ""}. Remove one casting first.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={combine} disabled={busy || request.length === 0} className="btn-primary">
          {busy ? "Combining…" : `Combine selected (${request.length})`}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Cancel
        </button>
      </div>

      {error && <p className="text-[var(--red)]">{error}</p>}
    </section>
  );
}
