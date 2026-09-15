"use client";

import { useState } from "react";

export interface PickerCandidate {
  id: string;
  name: string;
  summary: string;
}

// "+ Add …" link that opens a name input. As you type, existing performers in the production are
// offered (with the roles they already play) so their measurements are reused; the last option —
// and pressing Enter — always adds a NEW performer, so a same-named person is never merged silently.
export function PerformerPicker({
  placeholder,
  addLabel,
  block,
  busy,
  candidates,
  onAddNew,
  onPickExisting,
}: {
  placeholder: string;
  addLabel?: string;
  block?: boolean;
  busy: boolean;
  candidates: (query: string) => PickerCandidate[];
  onAddNew: (name: string) => void;
  onPickExisting: (performerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function close() {
    setOpen(false);
    setName("");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        + {addLabel ?? placeholder}
      </button>
    );
  }

  const typed = name.trim();
  const matches = candidates(name).slice(0, 8);

  return (
    <div className={block ? "w-full" : "inline-block"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!typed) return;
          onAddNew(typed);
          close();
        }}
        className={`${block ? "flex w-full flex-wrap" : "inline-flex"} items-center gap-1.5`}
      >
        <input
          autoFocus
          className="field w-44 !p-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button type="submit" disabled={busy || !typed} className="btn-ghost text-sm">
          Add new
        </button>
        <button type="button" onClick={close} className="link-muted text-sm">
          Cancel
        </button>
      </form>
      {(matches.length > 0 || typed) && (
        <ul className="surface mt-1 max-w-sm divide-y divide-[var(--field-line)] !p-0 text-sm">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPickExisting(m.id);
                  close();
                }}
                className="flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-[var(--bg)] disabled:opacity-50"
              >
                <span className="font-medium">{m.name}</span>
                {m.summary && <span className="text-xs muted">{m.summary}</span>}
              </button>
            </li>
          ))}
          {typed && (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onAddNew(typed);
                  close();
                }}
                className="w-full px-2.5 py-1.5 text-left text-[var(--red)] hover:bg-[var(--bg)] disabled:opacity-50"
              >
                + Add new &ldquo;{typed}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
