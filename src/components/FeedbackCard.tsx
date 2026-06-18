"use client";

import { useState } from "react";
import { FEEDBACK_TYPES, FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/lib/feedback-types";

export function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("fix");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, message }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send feedback.");
      }
    } catch {
      setError("Couldn't send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface mt-3 p-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="block text-left" aria-expanded="false">
          <span className="font-display text-xl font-semibold">Submit feedback →</span>
          <span className="mt-0.5 block text-sm muted">Tell us what to fix or improve</span>
        </button>
      ) : sent ? (
        <p className="text-sm">Thanks — we got your feedback.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="block text-left font-display text-xl font-semibold"
            aria-expanded="true"
          >
            Submit feedback
          </button>
          <fieldset className="space-y-1">
            {FEEDBACK_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="feedback-type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {FEEDBACK_TYPE_LABELS[t]}
              </label>
            ))}
          </fieldset>
          <textarea
            className="field w-full"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would you like to tell us?"
            aria-label="Feedback message"
          />
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy || !message.trim()}>
              Send feedback
            </button>
            <button type="button" className="link-muted text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
