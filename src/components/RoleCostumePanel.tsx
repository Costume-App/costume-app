"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { PhotoStrip } from "@/components/PhotoStrip";
import { MakeAssignment } from "@/components/MakeAssignment";
import { COSTUME_SOURCES, DEFAULT_SOURCE } from "@/lib/costume-sources";
import { resolvePieceSources, pieceKey } from "@/lib/costume-merge";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";
import type { Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

export function RoleCostumePanel({
  productionId,
  role,
  selectedCastId,
  castings,
  performers,
  casts,
  designs,
  setDesigns,
  pieces,
  setPieces,
  makers,
}: {
  productionId: string;
  role: Role;
  selectedCastId: string;
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
  makers: { id: string; name: string; color: string }[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingShared, setPendingShared] = useState<Record<string, string>>({});
  // Per-cast-member collapse on the Costume tab, persisted per role. Absent = expanded.
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>(
    `nada:prod:${productionId}:role:${role.id}:costcollapsed`,
    {},
  );

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  const castNameOf = (castId: string) => casts.find((c) => c.id === castId)?.name ?? "";
  const sources = resolvePieceSources(pieces);

  async function addDesign(name: string) {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId: role.id, name }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => [...prev, design]);
    } else setError("Couldn't add piece");
    setBusy(false);
  }

  async function setDesignNotes(designId: string, notes: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs/${designId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ notes }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => prev.map((d) => (d.id === designId ? design : d)));
    } else setError("Couldn't save notes");
    setBusy(false);
  }

  async function removeDesign(designId: string) {
    if (!confirm("Remove this piece from the costume? Removes it for every performer.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs/${designId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setDesigns((prev) => prev.filter((d) => d.id !== designId));
      setPieces((prev) => prev.filter((p) => p.costume_design_id !== designId));
    } else setError("Couldn't remove piece");
    setBusy(false);
  }

  async function setSource(designId: string, castingId: string, source: string, sharedWithCastingId: string | null) {
    setBusy(true);
    setError(null);
    // Preserve any fabric details + made flag already recorded for this piece
    // (e.g. from the Tailor's summary page) — changing only the source must not
    // wipe them. The empty-make-row delete still applies when nothing else is set.
    const existing = pieces.find(
      (p) => p.costume_design_id === designId && p.casting_id === castingId,
    );
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        designId,
        castingId,
        source,
        sharedWithCastingId,
        fabricType: existing?.fabric_type ?? null,
        fabricColor: existing?.fabric_color ?? null,
        fabricWidth: existing?.fabric_width ?? null,
        fabricSupplier: existing?.fabric_supplier ?? null,
        fabricYardage: existing?.fabric_yardage ?? null,
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        made: existing?.made ?? false,
        makerId: existing?.maker_id ?? null,
      }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: CostumePiece | null };
      setPieces((prev) => {
        const without = prev.filter((p) => !(p.costume_design_id === designId && p.casting_id === castingId));
        return piece ? [...without, piece] : without;
      });
    } else {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(msg ?? "Couldn't update source");
    }
    setBusy(false);
  }

  async function setPieceField(
    designId: string,
    castingId: string,
    patch: { makerId?: string | null; made?: boolean },
  ) {
    setBusy(true);
    setError(null);
    const existing = pieces.find(
      (p) => p.costume_design_id === designId && p.casting_id === castingId,
    );
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        designId,
        castingId,
        source: "make",
        sharedWithCastingId: null,
        fabricType: existing?.fabric_type ?? null,
        fabricColor: existing?.fabric_color ?? null,
        fabricWidth: existing?.fabric_width ?? null,
        fabricSupplier: existing?.fabric_supplier ?? null,
        fabricYardage: existing?.fabric_yardage ?? null,
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        made: patch.made !== undefined ? patch.made : existing?.made ?? false,
        makerId: patch.makerId !== undefined ? patch.makerId : existing?.maker_id ?? null,
      }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: CostumePiece | null };
      setPieces((prev) => {
        const without = prev.filter((p) => !(p.costume_design_id === designId && p.casting_id === castingId));
        return piece ? [...without, piece] : without;
      });
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
    }
    setBusy(false);
  }

  const roleDesigns = designs.filter((d) => d.role_id === role.id);
  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const ordered = [...(primary ? [primary] : []), ...forRole.filter((c) => c.assignment === "understudy")];

  return (
    <div className="space-y-2">
      <PieceEditor
        designs={roleDesigns}
        onAdd={addDesign}
        onRemove={removeDesign}
        busy={busy}
        renderExtra={(d) => (
          <div className="space-y-1.5">
            <textarea
              className="field w-full text-sm"
              rows={2}
              defaultValue={d.notes ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (d.notes ?? "")) setDesignNotes(d.id, e.target.value);
              }}
              placeholder="Notes (optional)"
              aria-label={`Notes for ${d.name}`}
            />
            <PhotoStrip
              endpoint={`/api/productions/${productionId}/designs/${d.id}/images`}
              max={6}
            />
          </div>
        )}
      />
      {ordered.length === 0 ? (
        <p className="text-sm muted">No one cast in this role yet.</p>
      ) : (
        ordered.map((casting) => {
          const makeCount = roleDesigns.filter(
            (d) => (sources[pieceKey(casting.id, d.id)]?.source ?? DEFAULT_SOURCE) === "make",
          ).length;
          return (
          <div key={casting.id} className="surface !shadow-none p-3">
            <button
              type="button"
              onClick={() => setCollapsed((m) => ({ ...m, [casting.id]: !m[casting.id] }))}
              className="-mx-3 -mt-3 mb-2 flex w-full items-center gap-2 rounded-t-[14px] border-b border-[var(--field-line)] bg-[var(--bg)] px-3 py-2 text-left text-lg font-semibold"
            >
              <span className="text-sm text-[var(--muted)]">{collapsed[casting.id] ? "▸" : "▾"}</span>
              <span>
                {nameOf(casting.performerId)}
                {casting.assignment === "understudy" && (
                  <span className="muted text-sm font-normal"> · Understudy</span>
                )}
              </span>
              {collapsed[casting.id] && (
                <span className="ml-auto text-sm font-normal muted">
                  (Make {makeCount} {makeCount === 1 ? "item" : "items"})
                </span>
              )}
            </button>
            {!collapsed[casting.id] &&
              (roleDesigns.length === 0 ? (
                <p className="text-sm muted">No pieces defined.</p>
              ) : (
              roleDesigns.map((d) => {
                const key = pieceKey(casting.id, d.id);
                const resolved = sources[key];
                const pending = key in pendingShared;
                const source = pending ? "shared" : resolved?.source ?? DEFAULT_SOURCE;
                const persistedShareCasting = resolved?.sharedWithPieceId
                  ? pieces.find((p) => p.id === resolved.sharedWithPieceId)?.casting_id ?? ""
                  : "";
                const sharedCastingId = pending ? pendingShared[key] : persistedShareCasting;
                const shareCandidates = castings.filter(
                  (c) =>
                    c.roleId === role.id &&
                    c.id !== casting.id &&
                    sources[pieceKey(c.id, d.id)]?.source !== "shared",
                );
                const piece = pieces.find(
                  (p) => p.costume_design_id === d.id && p.casting_id === casting.id,
                );
                return (
                  <div key={d.id} className="flex flex-col gap-1 py-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <select
                        className="field !p-1.5 text-sm shrink-0"
                        value={source}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "shared") {
                            setPendingShared((p) => ({ ...p, [key]: persistedShareCasting }));
                          } else {
                            setPendingShared((p) => {
                              const next = { ...p };
                              delete next[key];
                              return next;
                            });
                            setSource(d.id, casting.id, v, null);
                          }
                        }}
                      >
                        {COSTUME_SOURCES.map((s) => (
                          <option key={s.token} value={s.token}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {source === "shared" && (
                        <select
                          className="field !p-1.5 text-sm w-32 shrink-0 truncate"
                          value={sharedCastingId}
                          disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPendingShared((p) => ({ ...p, [key]: v }));
                            if (v) setSource(d.id, casting.id, "shared", v);
                          }}
                        >
                          <option value="">Whose?</option>
                          {shareCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {nameOf(c.performerId)} ({castNameOf(c.castId)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {source === "make" && (
                      <MakeAssignment
                        makers={makers}
                        makerId={piece?.maker_id ?? null}
                        made={piece?.made ?? false}
                        busy={busy}
                        onChangeMaker={(mk) => setPieceField(d.id, casting.id, { makerId: mk })}
                        onToggleMade={(md) => setPieceField(d.id, casting.id, { made: md })}
                      />
                    )}
                  </div>
                );
              })
              ))}
          </div>
          );
        })
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function PieceEditor({
  designs,
  onAdd,
  onRemove,
  busy,
  renderExtra,
}: {
  designs: CostumeDesign[];
  onAdd: (name: string) => void;
  onRemove: (designId: string) => void;
  busy: boolean;
  renderExtra?: (design: CostumeDesign) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="mb-1 space-y-2">
      <span className="lbl block">Pieces</span>
      {designs.map((d) => (
        <div key={d.id} className="space-y-1.5 rounded-md border border-[var(--field-line)] p-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 font-medium">{d.name}</span>
            <button
              type="button"
              aria-label={`Remove ${d.name}`}
              disabled={busy}
              onClick={() => onRemove(d.id)}
              className="shrink-0 text-lg leading-none text-[var(--red)] disabled:opacity-50"
            >
              ×
            </button>
          </div>
          {renderExtra?.(d)}
        </div>
      ))}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(name);
            setName("");
            setOpen(false);
          }}
          className="flex items-center gap-1.5"
        >
          <input
            autoFocus
            className="field w-full !p-1.5 text-sm sm:w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Piece name"
          />
          <button type="submit" disabled={busy} className="btn-ghost shrink-0 text-sm">
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setName("");
            }}
            className="link-muted shrink-0 text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
          + add piece
        </button>
      )}
    </div>
  );
}
