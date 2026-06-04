"use client";

import { useState } from "react";
import Link from "next/link";

export interface CastMember {
  performerId: string;
  name: string;
}

export interface RoleWithCast {
  roleId: string;
  roleName: string;
  primary: CastMember | null;
  understudies: CastMember[];
}

export function CastBoard({
  productionId,
  initialRoles,
}: {
  productionId: string;
  initialRoles: RoleWithCast[];
}) {
  const [roles, setRoles] = useState<RoleWithCast[]>(initialRoles);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { role } = (await res.json()) as { role: { id: string; name: string } };
      setRoles((prev) => [...prev, { roleId: role.id, roleName: role.name, primary: null, understudies: [] }]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }

  async function deleteRole(roleId: string) {
    setBusy(true);
    const res = await fetch(`/api/productions/${productionId}/roles/${roleId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setRoles((prev) => prev.filter((r) => r.roleId !== roleId));
    setBusy(false);
  }

  async function addCast(roleId: string, name: string, assignment: "primary" | "understudy") {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId, name, assignment }),
    });
    if (res.ok) {
      const { performer } = (await res.json()) as { performer: { id: string; label: string } };
      const member = { performerId: performer.id, name: performer.label };
      setRoles((prev) =>
        prev.map((r) =>
          r.roleId !== roleId
            ? r
            : assignment === "primary"
              ? { ...r, primary: member }
              : { ...r, understudies: [...r.understudies, member] },
        ),
      );
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCast(roleId: string, performerId: string) {
    setBusy(true);
    const res = await fetch(`/api/performers/${performerId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setRoles((prev) =>
        prev.map((r) =>
          r.roleId !== roleId
            ? r
            : {
                ...r,
                primary: r.primary?.performerId === performerId ? null : r.primary,
                understudies: r.understudies.filter((u) => u.performerId !== performerId),
              },
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
          No roles yet. Add the first character below.
        </p>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => (
            <li key={r.roleId} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-lg font-semibold">{r.roleName}</span>
                <button
                  onClick={() => deleteRole(r.roleId)}
                  disabled={busy}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete role
                </button>
              </div>

              <CastSlot
                label="Primary"
                productionId={productionId}
                member={r.primary}
                onAdd={(name) => addCast(r.roleId, name, "primary")}
                onRemove={(pid) => removeCast(r.roleId, pid)}
                busy={busy}
              />

              <div className="mt-2">
                <span className="text-xs uppercase tracking-wide text-gray-400">Understudies</span>
                {r.understudies.map((u) => (
                  <CastSlot
                    key={u.performerId}
                    productionId={productionId}
                    member={u}
                    onRemove={(pid) => removeCast(r.roleId, pid)}
                    busy={busy}
                  />
                ))}
                <AddName placeholder="Add understudy" onAdd={(name) => addCast(r.roleId, name, "understudy")} busy={busy} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border p-3"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add role
        </button>
      </form>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

function CastSlot({
  label,
  productionId,
  member,
  onAdd,
  onRemove,
  busy,
}: {
  label?: string;
  productionId: string;
  member: CastMember | null;
  onAdd?: (name: string) => void;
  onRemove: (performerId: string) => void;
  busy: boolean;
}) {
  if (!member) {
    return (
      <div className="mt-1">
        {label && <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">{label}</span>}
        {onAdd && <AddName placeholder={`Add ${label?.toLowerCase() ?? "name"}`} onAdd={onAdd} busy={busy} />}
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <span>
        {label && <span className="mr-2 text-xs uppercase tracking-wide text-gray-400">{label}</span>}
        <Link
          href={`/productions/${productionId}/performers/${member.performerId}`}
          className="font-medium hover:underline"
        >
          {member.name}
        </Link>
      </span>
      <button
        onClick={() => onRemove(member.performerId)}
        disabled={busy}
        className="text-sm text-red-600 hover:underline disabled:opacity-50"
      >
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
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
