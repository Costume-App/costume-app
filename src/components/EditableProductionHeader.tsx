"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { latestDate, todayIso } from "@/lib/countdown";
import { ToggleProductionActiveButton } from "@/components/ToggleProductionActiveButton";

interface ShowDateItem {
  id: string;
  show_date: string;
  show_time: string | null;
  label: string | null;
}

export function EditableProductionHeader({
  productionId,
  title,
  showDates,
  isActive,
  costumesDue,
}: {
  productionId: string;
  title: string;
  showDates: ShowDateItem[];
  isActive: boolean;
  costumesDue?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLabel, setNewLabel] = useState("");
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

  function saveCostumesDue(value: string) {
    return send(
      `/api/productions/${productionId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ costumesDueDate: value || null }) },
      "Couldn't save costumes-due date",
    );
  }

  async function addDate() {
    if (!newDate) return;
    const dup = showDates.some(
      (d) => d.show_date === newDate && (d.show_time ?? "").slice(0, 5) === newTime,
    );
    if (dup) {
      setError("That showing is already added.");
      return;
    }
    const ok = await send(
      `/api/productions/${productionId}/show-dates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: newDate, time: newTime || null, label: newLabel || null }),
      },
      "Couldn't add showing",
    );
    if (ok) {
      setNewDate("");
      setNewTime("");
      setNewLabel("");
    }
  }

  function removeDate(dateId: string) {
    return send(
      `/api/productions/${productionId}/show-dates/${dateId}`,
      { method: "DELETE" },
      "Couldn't remove date",
    );
  }

  function saveShowing(dateId: string, patch: { date?: string; time?: string; label?: string }) {
    return send(
      `/api/productions/${productionId}/show-dates/${dateId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) },
      "Couldn't save showing",
    );
  }

  function close() {
    setEditing(false);
    setName(title);
    setNewDate("");
    setNewTime("");
    setNewLabel("");
    setError(null);
  }

  const last = latestDate(showDates.map((d) => d.show_date));
  const isPast = last !== null && last < todayIso();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block text-left"
        title="Edit production"
      >
        <h1 className="font-display text-3xl font-semibold leading-none hover:text-[var(--red)]">
          {title}
        </h1>
      </button>
    );
  }

  return (
    <div className="surface relative w-full max-w-md space-y-3 p-4">
      <button
        type="button"
        onClick={close}
        disabled={busy}
        aria-label="Close"
        className="link-muted absolute right-3 top-3 text-lg leading-none"
      >
        ×
      </button>
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
        <span className="lbl block">Showings</span>
        {showDates.length === 0 && <p className="text-sm muted">No showings yet.</p>}
        {showDates.map((d) => (
          <div key={d.id} className="flex flex-col gap-1.5 border-b border-[var(--field-line)] pb-2">
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="field min-w-0 flex-1"
                defaultValue={d.show_date}
                onChange={(e) => e.target.value && saveShowing(d.id, { date: e.target.value })}
                aria-label="Showing date"
              />
              <input
                type="time"
                className="field w-32 shrink-0"
                defaultValue={(d.show_time ?? "").slice(0, 5)}
                onChange={(e) => saveShowing(d.id, { time: e.target.value })}
                aria-label="Showing time"
              />
              <button type="button" onClick={() => removeDate(d.id)} disabled={busy} className="link-muted shrink-0 text-sm">
                Remove
              </button>
            </div>
            <input
              type="text"
              className="field w-full"
              defaultValue={d.label ?? ""}
              onChange={(e) => saveShowing(d.id, { label: e.target.value })}
              aria-label="Showing label"
              placeholder="Label — e.g. Tech rehearsal"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="field min-w-0 flex-1"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <input
              type="time"
              className="field w-32 shrink-0"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              aria-label="Showing time (optional)"
            />
            <button type="button" onClick={addDate} disabled={busy || !newDate} className="btn-ghost shrink-0 text-sm">
              Add
            </button>
          </div>
          <input
            type="text"
            className="field w-full"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            aria-label="Showing label (optional)"
            placeholder="Label (optional)"
          />
        </div>
      </div>
      <label className="block">
        <span className="lbl mb-1 block">Costumes due</span>
        <input
          type="date"
          className="field w-full"
          defaultValue={costumesDue ?? ""}
          onChange={(e) => saveCostumesDue(e.target.value)}
        />
      </label>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--field-line)] pt-3">
        {isActive && isPast ? (
          <span className="text-sm muted">Add a future show date above to make this active again.</span>
        ) : (
          <ToggleProductionActiveButton productionId={productionId} isActive={isActive} />
        )}
        <button type="button" onClick={close} disabled={busy} className="btn-primary shrink-0">
          Done
        </button>
      </div>
    </div>
  );
}
