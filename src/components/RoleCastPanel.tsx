"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { MeasurementDot } from "@/components/MeasurementDot";
import { PerformerPicker } from "@/components/PerformerPicker";
import { pickerCandidates, performerRoleSummaries, isLastCasting } from "@/lib/performer-picker";
import type { Assignment } from "@/lib/casting-assignment";
import type { MeasureStatus, Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

interface CastingRow {
  id: string;
  cast_id: string;
  role_id: string;
  performer_id: string;
  assignment: Assignment;
}

const toCasting = (c: CastingRow): Casting => ({
  id: c.id,
  castId: c.cast_id,
  roleId: c.role_id,
  performerId: c.performer_id,
  assignment: c.assignment,
});

export function RoleCastPanel({
  productionId,
  role,
  roles,
  setRoles,
  casts,
  selectedCastId,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
}: {
  productionId: string;
  role: Role;
  roles: Role[];
  setRoles: Dispatch<SetStateAction<Role[]>>;
  casts: Cast[];
  selectedCastId: string;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  const statusOf = (performerId: string): MeasureStatus => measurementStatus[performerId] ?? "none";

  const summaries = performerRoleSummaries(performers, castings, roles, casts);
  const candidatesFor = (query: string) =>
    pickerCandidates(query, performers, castings, { castId: selectedCastId, roleId: role.id }).map((p) => ({
      id: p.id,
      name: p.name,
      summary: summaries[p.id] ?? "",
    }));

  async function addCastMember(who: { name: string } | { performerId: string }, assignment: Assignment) {
    if (!selectedCastId) return;
    if ("name" in who && !who.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/castings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ castId: selectedCastId, roleId: role.id, assignment, ...who }),
      });
      if (res.ok) {
        const { performer, casting } = (await res.json()) as {
          performer: { id: string; label: string };
          casting: CastingRow;
        };
        // A reused performer is already in state — only append genuinely new ones.
        setPerformers((prev) =>
          prev.some((p) => p.id === performer.id) ? prev : [...prev, { id: performer.id, name: performer.label }],
        );
        setCastings((prev) => [...prev, toCasting(casting)]);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
      }
    } catch {
      setError("Couldn't add cast member");
    } finally {
      setBusy(false);
    }
  }

  async function removeCasting(casting: Casting) {
    const who = nameOf(casting.performerId) || "this cast member";
    const castName = casts.find((c) => c.id === casting.castId)?.name;
    const message = isLastCasting(casting.performerId, casting.id, castings)
      ? `Remove ${who}? This is their only role, so their measurements will be deleted too.`
      : casts.length > 1
        ? `Remove ${who} from ${role.name} (${castName})?`
        : `Remove ${who} from ${role.name}?`;
    if (!confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/castings/${casting.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        const { performerDeleted } = (await res.json()) as { performerDeleted: boolean };
        setCastings((prev) => prev.filter((c) => c.id !== casting.id));
        if (performerDeleted) setPerformers((prev) => prev.filter((p) => p.id !== casting.performerId));
      } else {
        setError("Couldn't remove cast member");
      }
    } catch {
      setError("Couldn't remove cast member");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnsemble(next: boolean) {
    const count = castings.filter((c) => c.roleId === role.id).length;
    if (count > 0) {
      const noun = count === 1 ? "member" : "members";
      const message = next
        ? `${count} cast ${noun} will become ensemble ${noun}.`
        : "The first-added member in each cast becomes primary; the rest become understudies.";
      if (!confirm(message)) return;
    }
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/productions/${productionId}/roles/${role.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isEnsemble: next }),
        });
      } catch {
        setError("Couldn't update role");
        return;
      }
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update role");
        return;
      }
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, isEnsemble: next } : r)));
      // Assignments were converted server-side — pull the fresh castings.
      try {
        const list = await fetch(`/api/productions/${productionId}/castings`, { credentials: "include" });
        if (list.ok) {
          const { castings: rows } = (await list.json()) as { castings: CastingRow[] };
          setCastings(rows.map(toCasting));
        } else {
          setError("Role updated — reload the page to see the new cast layout.");
        }
      } catch {
        setError("Role updated — reload the page to see the new cast layout.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function renamePerformer(performerId: string, label: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/performers/${performerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setPerformers((prev) => prev.map((p) => (p.id === performerId ? { ...p, name: label } : p)));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't rename cast member");
    }
    setBusy(false);
  }

  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const understudies = forRole.filter((c) => c.assignment === "understudy");
  const ensemble = forRole.filter((c) => c.assignment === "ensemble");

  const link = (c: Casting, order?: number) => (
    <CastLink
      key={c.id}
      order={order}
      productionId={productionId}
      performerId={c.performerId}
      name={nameOf(c.performerId)}
      status={statusOf(c.performerId)}
      onRemove={() => removeCasting(c)}
      onRename={(label) => renamePerformer(c.performerId, label)}
      busy={busy}
    />
  );

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={role.isEnsemble}
          disabled={busy}
          onChange={(e) => toggleEnsemble(e.target.checked)}
        />
        Ensemble role <span className="muted">(no primary or understudies)</span>
      </label>

      {role.isEnsemble ? (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="lbl">Ensemble</span>
            <PerformerPicker
              placeholder="Add performer"
              block
              busy={busy}
              candidates={candidatesFor}
              onAddNew={(name) => addCastMember({ name }, "ensemble")}
              onPickExisting={(performerId) => addCastMember({ performerId }, "ensemble")}
            />
          </div>
          <div className="flex flex-col items-start gap-1">{ensemble.map((c) => link(c))}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {primary ? (
              link(primary)
            ) : (
              <PerformerPicker
                placeholder="Add primary"
                busy={busy}
                candidates={candidatesFor}
                onAddNew={(name) => addCastMember({ name }, "primary")}
                onPickExisting={(performerId) => addCastMember({ performerId }, "primary")}
              />
            )}
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="lbl">Understudies</span>
              <PerformerPicker
                placeholder="Add understudy"
                addLabel="Add"
                block
                busy={busy}
                candidates={candidatesFor}
                onAddNew={(name) => addCastMember({ name }, "understudy")}
                onPickExisting={(performerId) => addCastMember({ performerId }, "understudy")}
              />
            </div>
            <div className="flex flex-col items-start gap-1">{understudies.map((u, i) => link(u, i + 1))}</div>
          </div>
        </>
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function CastLink({
  productionId,
  performerId,
  name,
  onRemove,
  onRename,
  busy,
  order,
  status,
}: {
  productionId: string;
  performerId: string;
  name: string;
  onRemove: () => void;
  onRename: (label: string) => void;
  busy: boolean;
  order?: number;
  status?: MeasureStatus;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return; // stay in edit mode; require a non-empty name or Cancel
          if (v !== name) onRename(v);
          setEditing(false);
        }}
        className="inline-flex items-center gap-1.5"
      >
        {order != null && <span className="muted text-sm">{order}.</span>}
        <input
          autoFocus
          className="field w-44 !p-1.5 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn-ghost text-sm">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          className="link-muted text-sm"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {order != null && <span className="muted text-sm">{order}.</span>}
      {status && <MeasurementDot status={status} />}
      <Link href={`/productions/${productionId}/performers/${performerId}`} className="font-medium hover:underline">
        {name}
      </Link>
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        aria-label={`Rename ${name}`}
        title={`Rename ${name}`}
        className="opacity-60 hover:opacity-100"
      >
        <PencilIcon />
      </button>
      <button
        type="button"
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

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
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
