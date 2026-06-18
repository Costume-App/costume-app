"use client";

import { useEffect, useState } from "react";

type Share = { id: string; token: string; recipient_email: string | null; status: string; created_at: string };

export function SharePanel({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/productions/${productionId}/shares`, { credentials: "include" });
    if (res.ok) setShares(((await res.json()) as { shares: Share[] }).shares);
  }
  useEffect(() => {
    if (open && shares === null) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function linkFor(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientEmail: email || undefined }),
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't create the link.");
        return;
      }
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    try {
      await fetch(`/api/productions/${productionId}/shares/${shareId}`, { method: "DELETE", credentials: "include" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = (shares ?? []).filter((s) => s.status === "pending");

  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="link-red text-sm" aria-expanded="false">
          Share production →
        </button>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setOpen(false)} className="link-red text-sm font-medium" aria-expanded="true">
            Share production
          </button>
          <p className="text-sm muted">
            Creates a one-time link. The recipient signs in and copies this production&rsquo;s roles, costume designs,
            and their notes &amp; idea photos into their own organization. Performers and measurements are not shared.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field !p-1.5 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email the link (optional)"
              aria-label="Recipient email (optional)"
            />
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void create()}>
              Create share link
            </button>
          </div>
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}
          {pending.length > 0 && (
            <ul className="space-y-1 border-t border-[var(--field-line)] pt-2 text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="muted">{s.recipient_email ?? "Link"}</span>
                  <button
                    type="button"
                    className="link-muted text-xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(linkFor(s.token));
                      setCopied(s.id);
                    }}
                  >
                    {copied === s.id ? "Copied!" : "Copy link"}
                  </button>
                  <button type="button" className="link-muted text-xs" disabled={busy} onClick={() => void revoke(s.id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
