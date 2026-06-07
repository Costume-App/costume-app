"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProductionButton({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "delete";

  function close() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      router.push("/productions");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "Couldn't delete production");
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={open}
        className="link-muted text-sm"
      >
        Delete production
      </button>
      {open && (
        <div className="surface mt-2 w-full max-w-md space-y-3 p-4">
          <p id="delete-warning" className="text-sm">
            Deleting removes this production <strong>and all its cast, roles, castings, costume
            designs, and pieces</strong>. This can&apos;t be undone.
          </p>
          <label className="block">
            <span className="lbl mb-1 block">
              Type <code>delete</code> to confirm
            </span>
            <input
              className="field w-full"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              aria-describedby="delete-warning"
              autoFocus
            />
          </label>
          {error && <p className="text-[var(--red)] text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || busy}
              className="btn-primary"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="link-muted text-sm"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
