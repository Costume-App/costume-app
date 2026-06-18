"use client";

import { useState } from "react";

export function CheckoutButton({
  type,
  productionId,
  label,
  className,
}: {
  type: "unlock" | "seat" | "unlimited";
  productionId?: string;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, productionId }),
      });
      if (res.status === 503) {
        setMsg("Checkout isn't set up yet.");
        return;
      }
      if (!res.ok) {
        setMsg(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't start checkout.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setMsg("Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void go()} className={className ?? "btn-primary"}>
        {busy ? "Starting…" : label}
      </button>
      {msg && <p className="text-sm muted">{msg}</p>}
    </>
  );
}
