"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ToggleProductionActiveButton({
  productionId,
  isActive,
}: {
  productionId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={toggle} disabled={busy} className="link-muted text-sm">
        {busy ? "…" : isActive ? "Make inactive" : "Make active"}
      </button>
      {error && <p className="text-[var(--red)] mt-1 text-sm">{error}</p>}
    </div>
  );
}
