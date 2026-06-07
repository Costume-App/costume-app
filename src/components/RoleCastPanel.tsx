"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import type { MeasureStatus, Role, Performer, Casting } from "@/components/ProductionWorkspace";

export function RoleCastPanel({
  productionId,
  role,
  selectedCastId,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
}: {
  productionId: string;
  role: Role;
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

  async function addCastMember(name: string, assignment: "primary" | "understudy") {
    if (!name.trim() || !selectedCastId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ castId: selectedCastId, roleId: role.id, name, assignment }),
    });
    if (res.ok) {
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {primary ? (
          <CastLink
            productionId={productionId}
            performerId={primary.performerId}
            name={nameOf(primary.performerId)}
            status={statusOf(primary.performerId)}
            onRemove={() => removeCastMember(primary.performerId)}
            onRename={(label) => renamePerformer(primary.performerId, label)}
            busy={busy}
          />
        ) : (
          <AddName placeholder="Add primary" onAdd={(n) => addCastMember(n, "primary")} busy={busy} />
        )}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="lbl">Understudies</span>
          <AddName
            placeholder="Add understudy"
            addLabel="Add"
            block
            onAdd={(n) => addCastMember(n, "understudy")}
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
              onRename={(label) => renamePerformer(u.performerId, label)}
              busy={busy}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
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
    <svg width="13" height="13" viewBox="0 0 12 12" role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <circle cx="6" cy="6" r="5" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      {status === "partial" && <path d="M6 1 A5 5 0 0 0 6 11 Z" fill="var(--red)" />}
      {status === "complete" && <circle cx="6" cy="6" r="5" fill="var(--red)" stroke="var(--red)" strokeWidth="1.5" />}
    </svg>
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
          if (v && v !== name) onRename(v);
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
        className="field w-44 !p-1.5 text-sm"
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
