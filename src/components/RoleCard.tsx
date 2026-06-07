"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { aggregateMeasureStatus } from "@/lib/measurement-aggregate";
import { resolvePieceSources, pieceKey } from "@/lib/costume-merge";
import { DEFAULT_SOURCE } from "@/lib/costume-sources";
import { MeasurementDot } from "@/components/MeasurementDot";
import { NoteIcon, ImageIcon, ShirtIcon } from "@/components/role-icons";
import { Tabs } from "@/components/Tabs";
import { RoleNotesPanel } from "@/components/RoleNotesPanel";
import { RoleCastPanel } from "@/components/RoleCastPanel";
import { RoleCostumePanel } from "@/components/RoleCostumePanel";
import type { MeasureStatus, Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";

type RoleTab = "ideas" | "cast" | "costume";

export function RoleCard({
  role,
  productionId,
  selectedCastId,
  tint,
  edge,
  setRoles,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
  hasImages,
  casts,
  designs,
  setDesigns,
  pieces,
  setPieces,
}: {
  role: Role;
  productionId: string;
  selectedCastId: string;
  tint: string;
  edge: string;
  setRoles: Dispatch<SetStateAction<Role[]>>;
  hasImages: boolean;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
}) {
  const [open, setOpen] = usePersistentState<boolean>(`nada:prod:${productionId}:role:${role.id}:open`, false);
  const [activeTab, setActiveTab] = usePersistentState<RoleTab>(
    `nada:prod:${productionId}:role:${role.id}:tab`,
    "ideas",
  );
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(role.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primary = castings.find(
    (c) => c.castId === selectedCastId && c.roleId === role.id && c.assignment === "primary",
  );
  const summary = primary ? performers.find((p) => p.id === primary.performerId)?.name ?? "—" : "—";

  // Collapsed-row indicators.
  const measureAgg = aggregateMeasureStatus(
    castings
      .filter((c) => c.castId === selectedCastId && c.roleId === role.id)
      .map((c) => measurementStatus[c.performerId] ?? "none"),
  );
  const hasNotes = !!role.notes && role.notes.trim().length > 0;
  // Shirt is filled when any piece for this role still needs making (source = make).
  const sources = resolvePieceSources(pieces);
  const roleDesigns = designs.filter((d) => d.role_id === role.id);
  const hasPieces = roleDesigns.length > 0;
  const roleCastings = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const needsMake = roleCastings.some((c) =>
    roleDesigns.some((d) => (sources[pieceKey(c.id, d.id)]?.source ?? DEFAULT_SOURCE) === "make"),
  );

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameValue.trim();
    if (!name) return;
    if (name === role.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles/${role.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, name } : r)));
      setRenaming(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't rename role");
    }
    setBusy(false);
  }

  async function deleteRole() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles/${role.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      const designIds = designs.filter((d) => d.role_id === role.id).map((d) => d.id);
      setCastings((prev) => prev.filter((c) => c.roleId !== role.id));
      setDesigns((prev) => prev.filter((d) => d.role_id !== role.id));
      setPieces((prev) => prev.filter((p) => !designIds.includes(p.costume_design_id)));
      setRoles((prev) => prev.filter((r) => r.id !== role.id)); // unmounts this card
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete role");
      setBusy(false);
    }
  }

  return (
    <li className="surface p-0" style={{ backgroundColor: tint, borderColor: edge }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {renaming ? (
          <form onSubmit={saveName} className="flex flex-1 items-center gap-1.5">
            <input
              autoFocus
              className="field flex-1 !p-1.5 text-sm"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
            />
            <button type="submit" disabled={busy} className="btn-ghost text-sm">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setNameValue(role.name);
                setError(null);
              }}
              className="link-muted text-sm"
            >
              Cancel
            </button>
          </form>
        ) : confirmingDelete ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-sm">
              Delete &ldquo;{role.name}&rdquo;? Removes its cast &amp; costumes.
            </span>
            <button
              type="button"
              onClick={deleteRole}
              disabled={busy}
              className="text-sm text-[var(--red)] hover:underline disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                setError(null);
              }}
              disabled={busy}
              className="link-muted text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
              <span className="font-display text-lg font-semibold">{role.name}</span>
              {!open && (
                <span className="ml-auto flex items-center gap-1.5 text-xs muted">
                  {hasNotes && <NoteIcon />}
                  {hasImages && <ImageIcon />}
                  <MeasurementDot status={measureAgg} />
                  {hasPieces && <ShirtIcon done={!needsMake} />}
                  <span className="ml-0.5">{summary}</span>
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setNameValue(role.name);
                setRenaming(true);
              }}
              aria-label={`Rename ${role.name}`}
              title="Rename role"
              className="opacity-60 hover:opacity-100"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Remove ${role.name}`}
              title="Remove role"
              className="text-lg leading-none text-[var(--red)] hover:opacity-70"
            >
              ×
            </button>
          </>
        )}
      </div>

      {error && <p className="px-3 pb-2 text-sm text-[var(--red)]">{error}</p>}

      {open && (
        <div className="space-y-2 px-3 pb-3">
          <Tabs
            tabs={[
              { id: "ideas", label: "Ideas & Notes" },
              { id: "cast", label: "Cast & Measure" },
              { id: "costume", label: "Costume" },
            ]}
            active={activeTab}
            onChange={(id) => setActiveTab(id as RoleTab)}
          />
          {activeTab === "ideas" && (
            <RoleNotesPanel productionId={productionId} roleId={role.id} notes={role.notes} />
          )}
          {activeTab === "cast" && (
            <RoleCastPanel
              productionId={productionId}
              role={role}
              selectedCastId={selectedCastId}
              performers={performers}
              setPerformers={setPerformers}
              castings={castings}
              setCastings={setCastings}
              measurementStatus={measurementStatus}
            />
          )}
          {activeTab === "costume" && (
            <RoleCostumePanel
              productionId={productionId}
              role={role}
              selectedCastId={selectedCastId}
              castings={castings}
              performers={performers}
              casts={casts}
              designs={designs}
              setDesigns={setDesigns}
              pieces={pieces}
              setPieces={setPieces}
            />
          )}
        </div>
      )}
    </li>
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

