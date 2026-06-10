"use client";

import { useState } from "react";
import type { Role } from "@/components/ProductionWorkspace";

// A curated catalog match passed from the server, or null when the title is unknown.
export interface RoleSuggestion {
  id: string;
  title: string;
  roles: string[];
}

// Shown on an empty workspace to offer standard roles for a recognized play.
// Curated matches preview roles immediately; otherwise an AI button fetches them.
export function RoleSuggestionBanner({
  productionId,
  suggestion,
  aiEnabled,
  onRolesCreated,
  onDismiss,
}: {
  productionId: string;
  suggestion: RoleSuggestion | null;
  aiEnabled: boolean;
  onRolesCreated: (roles: Role[]) => void;
  onDismiss: () => void;
}) {
  const [aiRoles, setAiRoles] = useState<string[] | null>(null);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to offer: no curated match and AI disabled.
  if (!suggestion && !aiEnabled) return null;

  const names = suggestion ? suggestion.roles : aiRoles ?? [];
  const heading = suggestion ? suggestion.title : aiTitle;

  async function fetchAiRoles() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/suggest-roles`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { title: string; roles: string[] };
      setAiTitle(data.title);
      setAiRoles(data.roles);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't get suggestions");
    }
    setLoading(false);
  }

  async function addAll() {
    if (names.length === 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ names }),
    });
    if (res.ok) {
      const { roles } = (await res.json()) as { roles: { id: string; name: string; notes: string | null }[] };
      onRolesCreated(roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes })));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add roles");
      setLoading(false);
    }
    // On success the parent unmounts this banner (roles is no longer empty).
  }

  return (
    <div className="rounded-xl border border-[var(--field-line)] bg-[var(--field-tint,transparent)] p-5">
      {names.length > 0 ? (
        <>
          <p className="mb-1">
            {heading ? (
              <>This looks like <strong>{heading}</strong>. Add its {names.length} standard roles?</>
            ) : (
              <>Add these {names.length} suggested roles?</>
            )}
          </p>
          <p className="mb-3 text-sm muted">{names.join(" · ")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addAll} disabled={loading} className="btn-primary">
              {loading ? "Adding…" : "Add all roles"}
            </button>
            <button type="button" onClick={onDismiss} disabled={loading} className="link-muted text-sm">
              Dismiss
            </button>
          </div>
        </>
      ) : suggestion === null && aiEnabled ? (
        <>
          <p className="mb-3">Know this play&apos;s cast? Let AI suggest the standard roles.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fetchAiRoles} disabled={loading} className="btn-primary">
              {loading ? "Thinking…" : "Suggest roles with AI"}
            </button>
            <button type="button" onClick={onDismiss} disabled={loading} className="link-muted text-sm">
              Dismiss
            </button>
          </div>
          {aiRoles !== null && aiRoles.length === 0 && (
            <p className="mt-2 text-sm muted">No suggestions found for this title — add roles manually below.</p>
          )}
        </>
      ) : null}
      {error && <p className="mt-2 text-[var(--red)]">{error}</p>}
    </div>
  );
}
