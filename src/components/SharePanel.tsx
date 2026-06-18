"use client";

import { useEffect, useState, type ReactNode } from "react";

type Share = { id: string; token: string; recipient_email: string | null; status: string; created_at: string };

// A "Share production" link (admins only) that toggles a share form below it. `leftSlot`
// renders to its left on the same row (used for the back link in the production header);
// without it, the trigger is left-aligned for use at the bottom of a production card.
export function SharePanel({
  productionId,
  canShare,
  leftSlot,
}: {
  productionId: string;
  canShare: boolean;
  leftSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Share | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

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

  async function resend(shareId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/shares/${shareId}/resend`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setResent(shareId);
        window.setTimeout(() => setResent((r) => (r === shareId ? null : r)), 1500);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't resend the email.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    setRevoking(shareId); // strike the row through while it's being invalidated
    try {
      await fetch(`/api/productions/${productionId}/shares/${shareId}`, { method: "DELETE", credentials: "include" });
      if (created?.id === shareId) setCreated(null);
      await new Promise((r) => setTimeout(r, 400)); // let the strike-through register before it drops out
      await load();
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  }

  const pending = (shares ?? []).filter((s) => s.status === "pending");
  const others = pending.filter((s) => s.id !== created?.id);

  return (
    <>
      <div className={leftSlot ? "flex items-center justify-between gap-4" : ""}>
        {leftSlot}
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
        <div className={`mt-3 space-y-4 border-t border-[var(--field-line)] pt-3${leftSlot ? " mb-6" : ""}`}>
          <p className="text-sm muted">
            Share this production with another school or organization. Put the email of the person
            you want to share with in the email box below or, to create a link to share directly,
            click share. Once shared, the recipient signs in and they will see a copy of your
            production. This includes roles, costume designs, notes, ideas, and photos which they
            can start to use for their own version of the same production. Performers and their
            measurements are not shared.
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
                  <li
                    key={s.id}
                    className={`space-y-0.5 transition-opacity ${revoking === s.id ? "opacity-50" : ""}`}
                  >
                    {s.recipient_email && (
                      <span className={`muted block text-xs ${revoking === s.id ? "line-through" : ""}`}>
                        Sent to {s.recipient_email}{" "}
                        {revoking !== s.id && (
                          <button type="button" className="link-red" disabled={busy} onClick={() => void resend(s.id)}>
                            {resent === s.id ? "Sent!" : "Resend"}
                          </button>
                        )}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`muted min-w-0 flex-1 truncate ${revoking === s.id ? "line-through" : ""}`}>
                        {linkFor(s.token)}
                      </span>
                      {revoking !== s.id && (
                        <button type="button" className="link-red" onClick={() => void copy(s.token, s.id)}>
                          {copied === s.id ? "Copied!" : "Copy"}
                        </button>
                      )}
                      <button type="button" className="link-muted" disabled={busy} onClick={() => void revoke(s.id)}>
                        {revoking === s.id ? "Revoking…" : "Revoke"}
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
