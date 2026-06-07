"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatShowDate } from "@/lib/countdown";
import { ToggleProductionActiveButton } from "@/components/ToggleProductionActiveButton";

interface ShowDateItem {
  id: string;
  show_date: string;
}

export function EditableProductionHeader({
  productionId,
  title,
  showDates,
  isActive,
}: {
  productionId: string;
  title: string;
  showDates: ShowDateItem[];
  isActive: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight guard: state updates are async, so `busy` alone can't
  // stop a blur and a Done-click that fire in the same tick from overlapping.
  const inFlight = useRef(false);

  async function send(url: string, init: RequestInit, failMsg: string): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch(url, { credentials: "include", ...init });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? failMsg);
      setBusy(false);
      inFlight.current = false;
      return false;
    }
    setBusy(false);
    inFlight.current = false;
    router.refresh();
    return true;
  }

  function saveName() {
    return send(
      `/api/productions/${productionId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: name }) },
      "Couldn't save name",
    );
  }

  async function addDate() {
    if (!newDate) return;
    if (showDates.some((d) => d.show_date === newDate)) {
      setError("That date is already added.");
      return;
    }
    const ok = await send(
      `/api/productions/${productionId}/show-dates`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: newDate }) },
      "Couldn't add date",
    );
    if (ok) setNewDate("");
  }

  function removeDate(dateId: string) {
    return send(
      `/api/productions/${productionId}/show-dates/${dateId}`,
      { method: "DELETE" },
      "Couldn't remove date",
    );
  }

  if (!editing) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold leading-none">{title}</h1>
        <button type="button" onClick={() => setEditing(true)} className="link-muted mt-1 text-sm">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="surface w-full max-w-md space-y-3 p-4">
      <label className="block">
        <span className="lbl mb-1 block">Production name</span>
        <input
          className="field w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== title && saveName()}
        />
      </label>
      <div className="space-y-2">
        <span className="lbl block">Show dates</span>
        {showDates.length === 0 && <p className="text-sm muted">No dates yet.</p>}
        {showDates.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{formatShowDate(d.show_date)}</span>
            <button type="button" onClick={() => removeDate(d.id)} disabled={busy} className="link-muted text-sm">
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="field flex-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <button type="button" onClick={addDate} disabled={busy || !newDate} className="btn-ghost text-sm">
            Add date
          </button>
        </div>
      </div>
      <div className="border-t border-[var(--field-line)] pt-3">
        <span className="lbl mb-1 block">Status</span>
        <ToggleProductionActiveButton productionId={productionId} isActive={isActive} />
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setName(title);
          setNewDate("");
          setError(null);
        }}
        disabled={busy}
        className="link-muted text-sm"
      >
        Done
      </button>
    </div>
  );
}
