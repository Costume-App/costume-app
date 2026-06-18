"use client";

import { useEffect, useState } from "react";
import { CheckoutButton } from "@/components/CheckoutButton";

type Status = {
  isUnlimited: boolean;
  isPaidOrg: boolean;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  billingConfigured: boolean;
};

export function BillingTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

export function OrgBillingPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: Status) => active && setStatus(d))
      .catch(() => active && setError("Couldn't load billing."));
    return () => {
      active = false;
    };
  }, []);

  async function manage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't open billing.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError("Couldn't open billing.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-[var(--red)]">{error}</p>;
  if (!status) return <p className="text-sm muted">Loading…</p>;

  const planLabel = status.isUnlimited ? "Unlimited ($99/yr)" : status.isPaidOrg ? "Pay per production" : "No plan yet";

  return (
    <div className="space-y-4 text-sm">
      <div>
        <span className="lbl block">Current plan</span>
        <span className="font-medium">{planLabel}</span>
        {status.subscriptionStatus && status.subscriptionStatus !== "active" && (
          <span className="muted"> — {status.subscriptionStatus}</span>
        )}
      </div>
      {!status.billingConfigured && <p className="muted">Online checkout isn&rsquo;t set up yet.</p>}
      {status.billingConfigured && (
        <div className="flex flex-wrap gap-2">
          {!status.isUnlimited && <CheckoutButton type="unlimited" label="Go Unlimited — $99/yr" />}
          {status.hasStripeCustomer && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void manage()}>
              {busy ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
