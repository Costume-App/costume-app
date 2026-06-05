"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CollapsibleRole } from "@/components/CollapsibleRole";
import { COSTUME_SOURCES, DEFAULT_SOURCE } from "@/lib/costume-sources";
import { resolvePieceSources, pieceCountByRole, pieceKey } from "@/lib/costume-merge";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";
import type { Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

export function CostumesTab(props: {
  productionId: string;
  selectedCastId: string;
  roles: Role[];
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
  tint: string;
  edge: string;
}) {
  const { designs, setDesigns, pieces, setPieces } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cells where the user picked "Shared" but hasn't chosen a target yet.
  // Keyed by pieceKey(castingId, designId); value = chosen sharedWithCastingId ("" if none yet).
  const [pendingShared, setPendingShared] = useState<Record<string, string>>({});

  const nameOf = (performerId: string) => props.performers.find((p) => p.id === performerId)?.name ?? "";
  const castNameOf = (castId: string) => props.casts.find((c) => c.id === castId)?.name ?? "";
  const sources = resolvePieceSources(pieces);
  const counts = pieceCountByRole(designs);
  const inSelectedCast = props.castings.filter((c) => c.castId === props.selectedCastId);

  async function addDesign(roleId: string, name: string) {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${props.productionId}/designs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId, name }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => [...prev, design]);
    } else setError("Couldn't add piece");
    setBusy(false);
  }

  async function removeDesign(designId: string) {
    if (!confirm("Remove this piece from the costume? Removes it for every performer.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${props.productionId}/designs/${designId}`, {
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
    const res = await fetch(`/api/productions/${props.productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ designId, castingId, source, sharedWithCastingId }),
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

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Costumes</h2>
      {props.roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
          Add roles on the Cast and Measurements tab first.
        </p>
      ) : (
        <ul className="space-y-3">
          {props.roles.map((r) => {
            const roleDesigns = designs.filter((d) => d.role_id === r.id);
            const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
            const primary = forRole.find((c) => c.assignment === "primary");
            const ordered = [
              ...(primary ? [primary] : []),
              ...forRole.filter((c) => c.assignment === "understudy"),
            ];
            return (
              <CollapsibleRole
                key={r.id}
                title={r.name}
                summary={`${primary ? nameOf(primary.performerId) : "—"} · ${counts[r.id] ?? 0} pieces`}
                tint={props.tint}
                edge={props.edge}
              >
                <PieceEditor roleId={r.id} designs={roleDesigns} onAdd={addDesign} onRemove={removeDesign} busy={busy} />
                {ordered.length === 0 ? (
                  <p className="text-sm muted">No one cast in this role yet.</p>
                ) : (
                  ordered.map((casting) => (
                    <div key={casting.id} className="surface !shadow-none p-3">
                      <div className="mb-1 font-medium">
                        {nameOf(casting.performerId)}
                        {casting.assignment === "understudy" && <span className="muted text-sm"> · Understudy</span>}
                      </div>
                      {roleDesigns.length === 0 ? (
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
                          // Other performers in this role, excluding self and anyone whose own
                          // piece is itself "shared" (the server forbids chains).
                          const shareCandidates = props.castings.filter(
                            (c) =>
                              c.roleId === r.id &&
                              c.id !== casting.id &&
                              sources[pieceKey(c.id, d.id)]?.source !== "shared",
                          );
                          return (
                            <div key={d.id} className="flex flex-wrap items-center gap-2 py-1">
                              <span className="flex-1">{d.name}</span>
                              <select
                                className="field !p-1.5 text-sm"
                                value={source}
                                disabled={busy}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "shared") {
                                    // reveal the picker; don't PUT until a target is chosen
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
                                  className="field !p-1.5 text-sm"
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
                          );
                        })
                      )}
                    </div>
                  ))
                )}
              </CollapsibleRole>
            );
          })}
        </ul>
      )}
      {error && <p className="text-[var(--red)]">{error}</p>}
    </div>
  );
}

function PieceEditor({
  roleId,
  designs,
  onAdd,
  onRemove,
  busy,
}: {
  roleId: string;
  designs: CostumeDesign[];
  onAdd: (roleId: string, name: string) => void;
  onRemove: (designId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="mb-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="lbl">Pieces</span>
        {designs.map((d) => (
          <span key={d.id} className="chip">
            {d.name}
            <button
              type="button"
              aria-label={`Remove ${d.name}`}
              disabled={busy}
              onClick={() => onRemove(d.id)}
              className="ml-1 text-[var(--red)]"
            >
              ×
            </button>
          </span>
        ))}
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(roleId, name);
              setName("");
              setOpen(false);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <input
              autoFocus
              className="field w-28 !p-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Piece name"
            />
            <button type="submit" disabled={busy} className="btn-ghost text-sm">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setName("");
              }}
              className="link-muted text-sm"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
            + add
          </button>
        )}
      </div>
    </div>
  );
}
