"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Share = { id: string; token: string; recipient_email: string | null; status: string; created_at: string };

// Renders the production page's top bar: the "← Productions" back link, plus (for admins)
// a "Share production" link that toggles a full-width share form below the row.
export function SharePanel({ productionId, canShare }: { productionId: string; canShare: boolean }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Share | null>(null);
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

  async function copy(token: string, id: string) {
    await navigator.clipboard?.writeText(linkFor(token));
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
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
      const data = (await res.json()) as { share: Share };
      setCreated(data.share);
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
      if (created?.id === shareId) setCreated(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = (shares ?? []).filter((s) => s.status === "pending");
  const others = pending.filter((s) => s.id !== created?.id);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Link href="/productions" className="link-muted text-sm">
          ← Productions
        </Link>
        {canShare && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="link-red text-sm"
            aria-expanded={open}
          >
            Share production {open ? "" : "→"}
          </button>
        )}
      </div>

      {canShare && open && (
        <div className="mt-3 mb-6 space-y-4 border-t border-[var(--field-line)] pt-3">
          <p className="text-sm muted">
            Creates a one-time link. The recipient signs in and copies this production&rsquo;s roles,
            costume designs, and their notes &amp; idea photos into their own organization. Performers
            and measurements are not shared.
          </p>

          {/* Create — email is optional; the link is generated either way. */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="lbl">Email the link to (optional)</span>
              <input
                className="field !p-1.5 text-sm w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                aria-label="Recipient email (optional)"
              />
            </label>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void create()}>
              Share
            </button>
          </div>
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}

          {/* The just-created link, front and center. */}
          {created && (
            <div className="surface space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="lbl">
                  Share link ready{created.recipient_email ? ` — emailed to ${created.recipient_email}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setCreated(null)}
                  aria-label="Close"
                  className="link-muted shrink-0 text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  className="field !p-1.5 text-sm min-w-0 flex-1"
                  value={linkFor(created.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                />
                <button type="button" className="btn-primary" onClick={() => void copy(created.token, created.id)}>
                  {copied === created.id ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          )}

          {/* Older links you can still copy or revoke. */}
          {others.length > 0 && (
            <div className="space-y-1.5 border-t border-[var(--field-line)] pt-3">
              <span className="lbl block">Active links</span>
              <ul className="space-y-1.5 text-sm">
                {others.map((s) => (
                  <li key={s.id} className="space-y-0.5">
                    {s.recipient_email && (
                      <span className="muted block text-xs">Sent to {s.recipient_email}</span>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="muted min-w-0 flex-1 truncate">{linkFor(s.token)}</span>
                      <button type="button" className="link-red" onClick={() => void copy(s.token, s.id)}>
                        {copied === s.id ? "Copied!" : "Copy"}
                      </button>
                      <button type="button" className="link-muted" disabled={busy} onClick={() => void revoke(s.id)}>
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
