"use client";

import { useState, useEffect } from "react";
import { CAST_COLORS, DEFAULT_CAST_COLOR } from "@/lib/cast-colors";

interface MakerRow {
  id: string;
  name: string;
  color: string;
  clerk_user_id: string | null;
}

type OrgMember = { userId: string; name: string; email: string; imageUrl: string };

export function MakersManager({ initialMakers }: { initialMakers: MakerRow[] }) {
  const [makers, setMakers] = useState<MakerRow[]>(initialMakers);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CAST_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/org/members", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d: { members?: OrgMember[] }) => { if (active) setMembers(d.members ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const memberByUser = new Map(members.map((m) => [m.userId, m]));
  const linkedUserIds = new Set(makers.map((mk) => mk.clerk_user_id).filter(Boolean) as string[]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName, color: newColor }),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => [...prev, { id: maker.id, name: maker.name, color: maker.color, clerk_user_id: maker.clerk_user_id ?? null }]);
      setNewName("");
      setNewColor(DEFAULT_CAST_COLOR);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add maker");
    }
    setBusy(false);
  }

  async function patch(id: string, body: { name?: string; color?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: MakerRow };
      setMakers((prev) => prev.map((m) => (m.id === id ? { ...m, name: maker.name, color: maker.color } : m)));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save maker");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this maker? They'll be unassigned from any pieces.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/makers/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setMakers((prev) => prev.filter((m) => m.id !== id));
    } else {
      setError("Couldn't remove maker");
    }
    setBusy(false);
  }

  async function setMakerUser(id: string, clerkUserId: string | null) {
    setMakers((prev) => prev.map((mk) => (mk.id === id ? { ...mk, clerk_user_id: clerkUserId } : mk)));
    await fetch(`/api/makers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ clerkUserId }),
    }).catch(() => {});
  }

  async function addMemberAsMaker(m: OrgMember) {
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: m.name, clerkUserId: m.userId }),
    });
    if (res.ok) {
      const { maker } = (await res.json()) as { maker: { id: string; name: string; color: string; clerk_user_id: string | null } };
      setMakers((prev) => [...prev, maker]);
    }
  }

  return (
    <div className="space-y-3">
      {makers.length === 0 && <p className="text-sm muted">No makers yet. Add your costume team below.</p>}
      <ul className="space-y-2">
        {makers.map((mk) => (
          <li key={mk.id} className="surface !shadow-none flex flex-col gap-2 p-3">
            {/* Row 1: name on its own full-width line (so it doesn't collapse next to the swatches on mobile) */}
            <input
              className="field w-full"
              defaultValue={mk.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== mk.name && patch(mk.id, { name: e.target.value })}
              aria-label="Maker name"
            />
            {/* Row 2: color swatches + link status + remove */}
            <div className="flex flex-wrap items-center gap-2">
              <Swatches value={mk.color} onChange={(color) => patch(mk.id, { color })} />
              <select
                className="field !p-1.5 text-sm"
                value={mk.clerk_user_id ?? ""}
                disabled={busy}
                onChange={(e) => setMakerUser(mk.id, e.target.value || null)}
                aria-label="Link maker to member"
              >
                <option value="">Not linked</option>
                {mk.clerk_user_id && !memberByUser.has(mk.clerk_user_id) && (
                  <option value={mk.clerk_user_id}>Linked user</option>
                )}
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => remove(mk.id)} disabled={busy} className="ml-auto text-sm text-[var(--red)] hover:underline disabled:opacity-50">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="surface !shadow-none flex flex-wrap items-center gap-2 p-3">
        <input
          className="field min-w-0 flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a maker (name)"
        />
        <Swatches value={newColor} onChange={setNewColor} />
        <button type="submit" disabled={busy} className="btn-primary shrink-0 text-sm">
          Add maker
        </button>
      </form>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      {members.filter((m) => !linkedUserIds.has(m.userId)).length > 0 && (
        <div className="space-y-2 border-t border-[var(--field-line)] pt-3">
          <span className="lbl">Team members not yet makers</span>
          <ul className="space-y-1.5">
            {members.filter((m) => !linkedUserIds.has(m.userId)).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{m.name}<span className="muted"> · {m.email}</span></span>
                <button type="button" disabled={busy} onClick={() => addMemberAsMaker(m)} className="link-muted shrink-0">
                  + Add as maker
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (token: string) => void }) {
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
