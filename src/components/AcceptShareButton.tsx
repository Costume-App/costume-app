"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptShareButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shares/${token}/accept`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const { productionId } = (await res.json()) as { productionId: string };
        router.push(`/productions/${productionId}`);
        return;
      }
      const status = res.status;
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(
        status === 403
          ? "Create or select an organization first, then accept."
          : msg ?? "Couldn't accept this share.",
      );
    } catch {
      setError("Couldn't accept this share.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void accept()}>
        Accept &amp; copy to my organization
      </button>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
