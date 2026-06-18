"use client";

import { useState } from "react";

export function RequestToJoin({ orgId, orgName, domain }: { orgId: string; orgName: string; domain: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "unconfigured" | "error">("idle");

  async function request() {
    setBusy(true);
    try {
      const res = await fetch("/api/org/request-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const { sent } = (await res.json()) as { sent: boolean };
      setStatus(sent ? "sent" : "unconfigured");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface w-full max-w-md space-y-3 p-5 text-center">
      <p className="text-sm">
        Measure My Costume already has an organization for <span className="font-medium">{domain}</span> —{" "}
        <span className="font-medium">{orgName}</span>.
      </p>
      {status === "sent" ? (
        <p className="text-sm muted">We&rsquo;ve let the organization&rsquo;s admins know — they can invite you.</p>
      ) : status === "unconfigured" ? (
        <p className="text-sm muted">Ask an admin of {orgName} to invite you from their organization settings.</p>
      ) : (
        <>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void request()}>
            {busy ? "Requesting…" : "Request access"}
          </button>
          {status === "error" && (
            <p className="text-sm text-[var(--red)]">Couldn&rsquo;t send the request — ask an admin to invite you.</p>
          )}
        </>
      )}
    </div>
  );
}
