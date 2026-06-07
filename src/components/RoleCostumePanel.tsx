"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
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
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingShared, setPendingShared] = useState<Record<string, string>>({});

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
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
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

  const roleDesigns = designs.filter((d) => d.role_id === role.id);
  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const ordered = [...(primary ? [primary] : []), ...forRole.filter((c) => c.assignment === "understudy")];

  return (
    <div className="space-y-2">
      <PieceEditor designs={roleDesigns} onAdd={addDesign} onRemove={removeDesign} busy={busy} />
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
                const shareCandidates = castings.filter(
                  (c) =>
                    c.roleId === role.id &&
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
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function PieceEditor({
  designs,
  onAdd,
  onRemove,
  busy,
}: {
  designs: CostumeDesign[];
  onAdd: (name: string) => void;
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
              onAdd(name);
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
