"use client";

import { useState } from "react";
import Link from "next/link";

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

const COLOR_DOT: Record<string, string> = {
  slate: "bg-slate-400",
  gold: "bg-amber-400",
  blue: "bg-blue-500",
  red: "bg-red-500",
  green: "bg-emerald-500",
};

export function CastWorkspace({
  productionId,
  initialCasts,
  initialRoles,
  initialPerformers,
  initialCastings,
}: {
  productionId: string;
  initialCasts: Cast[];
  initialRoles: Role[];
  initialPerformers: Performer[];
  initialCastings: Casting[];
}) {
  const [casts, setCasts] = useState<Cast[]>(initialCasts);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [castings, setCastings] = useState<Casting[]>(initialCastings);
  const [selectedCastId, setSelectedCastId] = useState<string>(initialCasts[0]?.id ?? "");
  const [newRole, setNewRole] = useState("");
  const [newCast, setNewCast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";

  async function addCast(e: React.FormEvent) {
    e.preventDefault();
    if (!newCast.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/casts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newCast }),
    });
    if (res.ok) {
      const { cast } = (await res.json()) as { cast: Cast };
      setCasts((prev) => [...prev, cast]);
      setSelectedCastId(cast.id);
      setNewCast("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast");
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
      const { performer, casting } = (await res.json()) as {
        performer: { id: string; label: string };
        casting: Casting;
      };
      setPerformers((prev) => [...prev, { id: performer.id, name: performer.label }]);
      setCastings((prev) => [...prev, casting]);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCastMember(performerId: string) {
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

  return (
    <div className="space-y-5">
      {/* Cast switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {casts.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCastId(c.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              c.id === selectedCastId ? "border-black font-semibold" : "border-gray-200 text-gray-600"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[c.color] ?? "bg-slate-400"}`} />
            {c.name}
          </button>
        ))}
        <form onSubmit={addCast} className="flex items-center gap-1">
          <input
            className="w-28 rounded-lg border p-1.5 text-sm"
            value={newCast}
            onChange={(e) => setNewCast(e.target.value)}
            placeholder="+ Cast"
          />
          <button type="submit" disabled={busy} className="rounded-lg border px-2 py-1 text-sm disabled:opacity-50">
            Add
          </button>
        </form>
      </div>

      {/* Roles for the selected cast */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Roles &amp; cast</h2>
        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
            No roles yet. Add the first character below.
          </p>
        ) : (
          <ul className="space-y-3">
            {roles.map((r) => {
              const forRole = inSelectedCast.filter((c) => c.roleId === r.id);
              const primary = forRole.find((c) => c.assignment === "primary");
              const understudies = forRole.filter((c) => c.assignment === "understudy");
              return (
                <li key={r.id} className="rounded-lg border p-4">
                  <div className="mb-2 text-lg font-semibold">{r.name}</div>

                  <div className="mt-1">
                    <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">Primary</span>
                    {primary ? (
                      <CastLink
                        productionId={productionId}
                        performerId={primary.performerId}
                        name={nameOf(primary.performerId)}
                        onRemove={() => removeCastMember(primary.performerId)}
                        busy={busy}
                      />
                    ) : (
                      <AddName placeholder="Add primary" onAdd={(n) => addCastMember(r.id, n, "primary")} busy={busy} />
                    )}
                  </div>

                  <div className="mt-2">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Understudies</span>
                    {understudies.map((u) => (
                      <CastLink
                        key={u.performerId}
                        productionId={productionId}
                        performerId={u.performerId}
                        name={nameOf(u.performerId)}
                        onRemove={() => removeCastMember(u.performerId)}
                        busy={busy}
                      />
                    ))}
                    <AddName placeholder="Add understudy" onAdd={(n) => addCastMember(r.id, n, "understudy")} busy={busy} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50">
          Add role
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function CastLink({
  productionId,
  performerId,
  name,
  onRemove,
  busy,
}: {
  productionId: string;
  performerId: string;
  name: string;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <Link href={`/productions/${productionId}/performers/${performerId}`} className="font-medium hover:underline">
        {name}
      </Link>
      <button onClick={onRemove} disabled={busy} className="text-sm text-red-600 hover:underline disabled:opacity-50">
        Remove
      </button>
    </div>
  );
}

function AddName({
  placeholder,
  onAdd,
  busy,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
        setName("");
      }}
      className="mt-1 flex gap-2"
    >
      <input
        className="flex-1 rounded-lg border p-2 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
      />
      <button type="submit" disabled={busy} className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
