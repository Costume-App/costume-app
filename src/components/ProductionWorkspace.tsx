"use client";

import { useState } from "react";
import {
  CAST_COLORS,
  castColorHex,
  castColorTint,
  castColorEdge,
  DEFAULT_CAST_COLOR,
} from "@/lib/cast-colors";
import { RoleCard } from "@/components/RoleCard";
import { RoleIconLegend } from "@/components/RoleIconLegend";
import { usePersistentState } from "@/lib/use-persistent-state";
import { RoleSuggestionBanner, type RoleSuggestion } from "@/components/RoleSuggestionBanner";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";

export type MeasureStatus = "none" | "partial" | "complete";
export interface Cast { id: string; name: string; color: string }
export interface Role { id: string; name: string; notes: string | null }
export interface Performer { id: string; name: string }
export interface Casting {
  id: string;
  castId: string;
  roleId: string;
  performerId: string;
  assignment: "primary" | "understudy";
}

export function ProductionWorkspace({
  productionId,
  initialCasts,
  initialRoles,
  initialPerformers,
  initialCastings,
  measurementStatus,
  imageRoleIds,
  initialDesigns,
  initialPieces,
  makers,
  roleSuggestion,
  aiEnabled,
}: {
  productionId: string;
  initialCasts: Cast[];
  initialRoles: Role[];
  initialPerformers: Performer[];
  initialCastings: Casting[];
  measurementStatus: Record<string, MeasureStatus>;
  imageRoleIds: string[];
  initialDesigns: CostumeDesign[];
  initialPieces: CostumePiece[];
  makers: { id: string; name: string; color: string }[];
  roleSuggestion: RoleSuggestion | null;
  aiEnabled: boolean;
}) {
  const imageRoleIdSet = new Set(imageRoleIds);
  const [casts, setCasts] = useState<Cast[]>(initialCasts);
  const [selectedCastId, setSelectedCastId] = usePersistentState<string>(
    `nada:prod:${productionId}:cast`,
    initialCasts[0]?.id ?? "",
  );
  // Shared workspace data lives here so both tabs (and cast switches) stay live
  // without a reload — the role cards' panels mutate these via the setters below.
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [castings, setCastings] = useState<Casting[]>(initialCastings);
  const [designs, setDesigns] = useState<CostumeDesign[]>(initialDesigns);
  const [pieces, setPieces] = useState<CostumePiece[]>(initialPieces);
  const [newRole, setNewRole] = useState("");
  const [newCast, setNewCast] = useState("");
  const [newCastColor, setNewCastColor] = useState(DEFAULT_CAST_COLOR);
  const [showAddCast, setShowAddCast] = useState(false);
  const [showRenameCast, setShowRenameCast] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameColor, setRenameColor] = useState(DEFAULT_CAST_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestDismissed, setSuggestDismissed] = usePersistentState<boolean>(
    `nada:prod:${productionId}:roleSuggestDismissed`,
    false,
  );

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRole.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newRole }),
    });
    if (res.ok) {
      const { role } = (await res.json()) as { role: { id: string; name: string; notes: string | null } };
      setRoles((prev) => [...prev, { id: role.id, name: role.name, notes: role.notes }]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }

  async function addCast(e: React.FormEvent) {
    e.preventDefault();
    if (!newCast.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/casts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newCast, color: newCastColor }),
    });
    if (res.ok) {
      const { cast } = (await res.json()) as { cast: Cast };
      setCasts((prev) => [...prev, cast]);
      setSelectedCastId(cast.id);
      setNewCast("");
      setNewCastColor(DEFAULT_CAST_COLOR);
      setShowAddCast(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast");
    }
    setBusy(false);
  }

  async function renameCast(e: React.FormEvent) {
    e.preventDefault();
    if (!renameValue.trim() || !selectedCastId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/casts/${selectedCastId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: renameValue, color: renameColor }),
    });
    if (res.ok) {
      const { cast } = (await res.json()) as { cast: Cast };
      setCasts((prev) =>
        prev.map((c) => (c.id === selectedCastId ? { ...c, name: cast.name, color: cast.color } : c)),
      );
      setShowRenameCast(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't rename cast");
    }
    setBusy(false);
  }

  async function deleteCast(castId: string) {
    if (!confirm("Delete this cast and all of its assignments? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/casts/${castId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      const remaining = casts.filter((c) => c.id !== castId);
      setCasts(remaining);
      setSelectedCastId(remaining[0]?.id ?? "");
      setShowRenameCast(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete cast");
    }
    setBusy(false);
  }

  const selectedColor = casts.find((c) => c.id === selectedCastId)?.color ?? DEFAULT_CAST_COLOR;
  const tint = castColorTint(selectedColor);
  const edge = castColorEdge(selectedColor);

  return (
    <div className="space-y-5">
      {/* Cast switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {casts.map((c) => {
          const selected = c.id === selectedCastId;
          if (selected && showRenameCast) {
            return (
              <form key={c.id} onSubmit={renameCast} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    className="field w-28 !p-1.5 text-sm"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Cast name"
                  />
                  <button type="submit" disabled={busy} className="btn-ghost text-sm">
                    Save
                  </button>
                  <button type="button" onClick={() => setShowRenameCast(false)} className="link-muted text-sm">
                    Cancel
                  </button>
                  {casts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteCast(c.id)}
                      disabled={busy}
                      className="text-sm text-[var(--red)] hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <ColorSwatches value={renameColor} onChange={setRenameColor} />
              </form>
            );
          }
          return (
            <span key={c.id} className={`chip ${selected ? "chip-selected" : ""}`}>
              <button type="button" onClick={() => setSelectedCastId(c.id)} className="flex items-center gap-2">
                <span className="dot" style={{ background: castColorHex(c.color) }} />
                {c.name}
              </button>
              {selected && (
                <button
                  type="button"
                  aria-label={`Rename ${c.name}`}
                  title="Rename cast"
                  onClick={() => {
                    setRenameValue(c.name);
                    setRenameColor(c.color);
                    setShowRenameCast(true);
                  }}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <PencilIcon />
                </button>
              )}
            </span>
          );
        })}

        {showAddCast ? (
          <form onSubmit={addCast} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <input
                autoFocus
                className="field w-28 !p-1.5 text-sm"
                value={newCast}
                onChange={(e) => setNewCast(e.target.value)}
                placeholder="Cast name"
              />
              <button type="submit" disabled={busy} className="btn-ghost text-sm">
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCast(false);
                  setNewCast("");
                  setNewCastColor(DEFAULT_CAST_COLOR);
                }}
                className="link-muted text-sm"
              >
                Cancel
              </button>
            </div>
            <ColorSwatches value={newCastColor} onChange={setNewCastColor} />
          </form>
        ) : (
          <button
            type="button"
            aria-label="Add cast"
            title="Add cast"
            onClick={() => setShowAddCast(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--field-line)] text-lg leading-none text-[var(--muted)] hover:border-[var(--red)] hover:text-[var(--red)]"
          >
            +
          </button>
        )}
      </div>

      {roles.length === 0 ? (
        <>
          {!suggestDismissed && (
            <RoleSuggestionBanner
              productionId={productionId}
              suggestion={roleSuggestion}
              aiEnabled={aiEnabled}
              onRolesCreated={(created) => setRoles((prev) => [...prev, ...created])}
              onDismiss={() => setSuggestDismissed(true)}
            />
          )}
          <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
            No roles yet. Add the first character below.
          </p>
        </>
      ) : (
        <ul className="space-y-3">
          <li>
            <RoleIconLegend />
          </li>
          {roles.map((r) => (
            <RoleCard
              key={r.id}
              role={r}
              productionId={productionId}
              selectedCastId={selectedCastId}
              tint={tint}
              edge={edge}
              setRoles={setRoles}
              performers={performers}
              setPerformers={setPerformers}
              castings={castings}
              setCastings={setCastings}
              measurementStatus={measurementStatus}
              hasImages={imageRoleIdSet.has(r.id)}
              casts={casts}
              designs={designs}
              setDesigns={setDesigns}
              pieces={pieces}
              setPieces={setPieces}
              makers={makers}
            />
          ))}
        </ul>
      )}

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="field flex-1"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          Add role
        </button>
      </form>

      {error && <p className="text-[var(--red)]">{error}</p>}
    </div>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {CAST_COLORS.map((c) => (
        <button
          key={c.token}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.token}
          title={c.label}
          onClick={() => onChange(c.token)}
          className={`h-5 w-5 rounded-full border border-black/10 ${
            value === c.token ? "outline outline-2 outline-offset-1 outline-[var(--ink)]" : ""
          }`}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
