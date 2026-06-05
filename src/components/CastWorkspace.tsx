"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CAST_COLORS,
  castColorHex,
  castColorTint,
  castColorEdge,
  DEFAULT_CAST_COLOR,
} from "@/lib/cast-colors";

type MeasureStatus = "none" | "partial" | "complete";

interface Cast { id: string; name: string; color: string }
interface Role { id: string; name: string }
interface Performer { id: string; name: string }
interface Casting {
  id: string;
  castId: string;
  roleId: string;
  performerId: string;
  assignment: "primary" | "understudy";
}

export function CastWorkspace({
  productionId,
  initialCasts,
  initialRoles,
  initialPerformers,
  initialCastings,
  measurementStatus,
}: {
  productionId: string;
  initialCasts: Cast[];
  initialRoles: Role[];
  initialPerformers: Performer[];
  initialCastings: Casting[];
  measurementStatus: Record<string, MeasureStatus>;
}) {
  const [casts, setCasts] = useState<Cast[]>(initialCasts);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [castings, setCastings] = useState<Casting[]>(initialCastings);
  const [selectedCastId, setSelectedCastId] = useState<string>(initialCasts[0]?.id ?? "");
  const [newRole, setNewRole] = useState("");
  const [newCast, setNewCast] = useState("");
  const [newCastColor, setNewCastColor] = useState(DEFAULT_CAST_COLOR);
  const [showAddCast, setShowAddCast] = useState(false);
  const [showRenameCast, setShowRenameCast] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameColor, setRenameColor] = useState(DEFAULT_CAST_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  // Newly added members (this session) have no measurements yet → "none".
  const statusOf = (performerId: string): MeasureStatus => measurementStatus[performerId] ?? "none";

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
      setCastings((prev) => prev.filter((c) => c.castId !== castId));
      setSelectedCastId(remaining[0]?.id ?? "");
      setShowRenameCast(false);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete cast");
    }
    setBusy(false);
  }

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
      const { role } = (await res.json()) as { role: Role };
      setRoles((prev) => [...prev, role]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }

  async function addCastMember(roleId: string, name: string, assignment: "primary" | "understudy") {
    if (!name.trim() || !selectedCastId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ castId: selectedCastId, roleId, name, assignment }),
    });
    if (res.ok) {
      // API returns snake_case DB rows; map to this component's camelCase shape
      // so the new casting matches the cast filter and shows immediately.
      const { performer, casting } = (await res.json()) as {
        performer: { id: string; label: string };
        casting: {
          id: string;
          cast_id: string;
          role_id: string;
          performer_id: string;
          assignment: "primary" | "understudy";
        };
      };
      setPerformers((prev) => [...prev, { id: performer.id, name: performer.label }]);
      setCastings((prev) => [
        ...prev,
        {
          id: casting.id,
          castId: casting.cast_id,
          roleId: casting.role_id,
          performerId: casting.performer_id,
          assignment: casting.assignment,
        },
      ]);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCastMember(performerId: string) {
    const who = nameOf(performerId);
    if (!confirm(`Remove ${who || "this cast member"}? This also deletes their measurements and can't be undone.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/performers/${performerId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setCastings((prev) => prev.filter((c) => c.performerId !== performerId));
    } else {
      setError("Couldn't remove cast member");
    }
    setBusy(false);
  }

  const inSelectedCast = castings.filter((c) => c.castId === selectedCastId);
  const selectedColor = casts.find((c) => c.id === selectedCastId)?.color ?? DEFAULT_CAST_COLOR;

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

      {/* Roles for the selected cast */}
      <section>
        <h2 className="font-display mb-3 text-xl font-semibold">Roles &amp; Cast</h2>
        {roles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
            No roles yet. Add the first character below.
          </p>
        ) : (
          <ul className="space-y-3">
            {roles.map((r) => {
              const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
              const primary = forRole.find((c) => c.assignment === "primary");
              const understudies = forRole.filter((c) => c.assignment === "understudy");
              return (
                <li
                  key={r.id}
                  className="surface space-y-2 p-3"
                  style={{
                    backgroundColor: castColorTint(selectedColor),
                    borderColor: castColorEdge(selectedColor),
                  }}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-display min-w-[7rem] text-lg font-semibold">{r.name}</span>

                    {primary ? (
                      <CastLink
                        productionId={productionId}
                        performerId={primary.performerId}
                        name={nameOf(primary.performerId)}
                        status={statusOf(primary.performerId)}
                        onRemove={() => removeCastMember(primary.performerId)}
                        busy={busy}
                      />
                    ) : (
                      <AddName placeholder="Add primary" onAdd={(n) => addCastMember(r.id, n, "primary")} busy={busy} />
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="lbl">Understudies</span>
                      <AddName
                        placeholder="Add understudy"
                        addLabel="Add"
                        block
                        onAdd={(n) => addCastMember(r.id, n, "understudy")}
                        busy={busy}
                      />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      {understudies.map((u, i) => (
                        <CastLink
                          key={u.performerId}
                          order={i + 1}
                          productionId={productionId}
                          performerId={u.performerId}
                          name={nameOf(u.performerId)}
                          status={statusOf(u.performerId)}
                          onRemove={() => removeCastMember(u.performerId)}
                          busy={busy}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

function MeasurementDot({ status }: { status: MeasureStatus }) {
  const label =
    status === "complete"
      ? "Measurements complete"
      : status === "partial"
        ? "Measurements in progress"
        : "No measurements yet";
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 12 12"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <title>{label}</title>
      {/* outline ring (always) */}
      <circle cx="6" cy="6" r="5" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      {/* left half filled = in progress */}
      {status === "partial" && <path d="M6 1 A5 5 0 0 0 6 11 Z" fill="var(--red)" />}
      {/* whole circle filled = complete */}
      {status === "complete" && <circle cx="6" cy="6" r="5" fill="var(--red)" stroke="var(--red)" strokeWidth="1.5" />}
    </svg>
  );
}

function CastLink({
  productionId,
  performerId,
  name,
  onRemove,
  busy,
  order,
  status,
}: {
  productionId: string;
  performerId: string;
  name: string;
  onRemove: () => void;
  busy: boolean;
  order?: number;
  status?: MeasureStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {order != null && <span className="muted text-sm">{order}.</span>}
      {status && <MeasurementDot status={status} />}
      <Link
        href={`/productions/${productionId}/performers/${performerId}`}
        className="font-medium hover:underline"
      >
        {name}
      </Link>
      <button
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        className="text-base leading-none text-[var(--red)] hover:opacity-70 disabled:opacity-50"
      >
        ×
      </button>
    </span>
  );
}

function AddName({
  placeholder,
  addLabel,
  onAdd,
  busy,
  block,
}: {
  placeholder: string;
  addLabel?: string;
  onAdd: (name: string) => void;
  busy: boolean;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        + {addLabel ?? placeholder}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
        setName("");
        setOpen(false);
      }}
      className={`${block ? "flex w-full flex-wrap" : "inline-flex"} items-center gap-1.5`}
    >
      <input
        autoFocus
        className="field w-28 !p-1.5 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
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
  );
}
