"use client";

import { formatHeight } from "@/lib/height";
import { MAX_NEW_PERFORMER_NAME } from "@/lib/measurement-import/limits";
import { contributes, orderedEntries, reviewBlocks, type ParseFailure } from "@/lib/measurement-import/review";
import { fieldStatus } from "@/lib/measurement-import/status";
import type { ExistingData, FieldStatus, FormDraft, FormSelection, PerformerTarget } from "@/lib/measurement-import/types";

const STATUS_LABEL: Record<FieldStatus, string> = {
  new: "new",
  changed: "changed",
  same: "same",
  unreadable: "couldn't read",
};

function show(key: string, value: number | string | undefined): string {
  if (value === undefined) return "";
  if (key === "height" && typeof value === "number") return formatHeight(value);
  return String(value);
}

function targetValue(target: PerformerTarget): string {
  return target.kind === "existing" ? target.performerId : "new";
}

// The downscaled photo, so the reviewer can check a value against the handwriting.
function Thumb({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label="Open the photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-20 w-16 rounded object-cover" />
    </a>
  );
}

// One card per read photo: who it is for, every recognized field against what is saved, and the
// notes block. Ticked rows are what the import writes.
export function MeasurementImportReview({
  order,
  drafts,
  existing,
  selections,
  failures,
  thumbs,
  busy,
  importing,
  onSelectionChange,
  onPerformerChange,
  onRemove,
  onRetry,
  onImport,
}: {
  order: string[];
  drafts: FormDraft[];
  existing: ExistingData;
  selections: Record<string, FormSelection>;
  failures: ParseFailure[];
  thumbs: Record<string, string>;
  busy: boolean;
  importing: boolean;
  onSelectionChange: (draftId: string, selection: FormSelection) => void;
  onPerformerChange: (draftId: string, target: PerformerTarget) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onImport: () => void;
}) {
  const byId = new Map(existing.performers.map((p) => [p.id, p]));
  const labels = new Map(existing.definitions.map((d) => [d.key, d.label]));
  const blocks = reviewBlocks(drafts, existing, selections);
  const cardBlocked = Object.keys(blocks.cards).length > 0;
  const entries = orderedEntries(order, drafts, failures);

  const importable = drafts.filter((d) => {
    const hasName = d.performer.kind === "existing" || d.performer.name.trim() !== "";
    return hasName && contributes(d, selections[d.id]);
  });

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        if (entry.kind === "failure") {
          const f = entry.failure;
          return (
            <div key={f.id} className="flex items-start gap-3 rounded-xl border border-[var(--field-line)] p-4 text-sm">
              <Thumb url={thumbs[f.id]} />
              <div className="min-w-0">
                <p className="font-medium">{f.fileName}</p>
                <p className="text-[var(--red)]">{f.message}</p>
                <p className="mt-1 flex gap-3">
                  {f.retryable && (
                    <button type="button" onClick={() => onRetry(f.id)} disabled={busy} className="link-red">
                      Try again
                    </button>
                  )}
                  <button type="button" onClick={() => onRemove(f.id)} disabled={busy} className="link-muted">
                    Remove
                  </button>
                </p>
              </div>
            </div>
          );
        }
        const draft = entry.draft;
        const selection = selections[draft.id] ?? { fields: {}, notes: false };
        const chosen = draft.performer.kind === "existing" ? byId.get(draft.performer.performerId) : undefined;
        const saved = chosen?.measurements ?? {};
        const blockMessage = blocks.cards[draft.id];
        return (
          <div key={draft.id} className="rounded-xl border border-[var(--field-line)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Thumb url={thumbs[draft.id]} />
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold">{draft.name ?? "No name read"}</p>
                  <p className="text-sm muted">
                    {draft.fileName}
                    {draft.castedAs ? ` · Casted as: ${draft.castedAs}` : ""}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => onRemove(draft.id)} disabled={busy} className="link-muted text-sm">
                Remove
              </button>
            </div>

            <label className="mt-3 block text-sm">
              <span className="muted">Performer</span>
              <select
                className="field mt-1 w-full"
                value={targetValue(draft.performer)}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  onPerformerChange(draft.id, v === "new" ? { kind: "new", name: draft.name ?? "" } : { kind: "existing", performerId: v });
                }}
              >
                {draft.candidateIds.map((id) => (
                  <option key={id} value={id}>
                    {byId.get(id)?.name ?? id} (name match)
                  </option>
                ))}
                <option value="new">New performer</option>
                {existing.performers
                  .filter((p) => !draft.candidateIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {draft.performer.kind === "new" && (
              <label className="mt-2 block text-sm">
                <span className="muted">New performer name</span>
                <input
                  className="field mt-1 w-full"
                  value={draft.performer.name}
                  disabled={busy}
                  maxLength={MAX_NEW_PERFORMER_NAME}
                  onChange={(e) => onPerformerChange(draft.id, { kind: "new", name: e.target.value })}
                />
              </label>
            )}
            {blockMessage && <p className="mt-2 text-sm text-[var(--red)]">{blockMessage}</p>}

            {draft.fields.length === 0 ? (
              <p className="mt-3 text-sm muted">No measurements were read from this photo.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left muted">
                    <th className="py-1 pr-2 font-normal">Field</th>
                    <th className="py-1 pr-2 font-normal">Saved</th>
                    <th className="py-1 pr-2 font-normal">On form</th>
                    <th className="py-1 font-normal">Import</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.fields.map((field) => {
                    const status = fieldStatus(field, saved[field.key]);
                    const formValue = field.valueNumeric !== null ? show(field.key, field.valueNumeric) : field.valueText ?? "";
                    return (
                      <tr key={field.key} className={status === "unreadable" ? "muted" : ""}>
                        <td className="py-1 pr-2">{labels.get(field.key) ?? field.key}</td>
                        <td className="py-1 pr-2">{show(field.key, saved[field.key])}</td>
                        <td className="py-1 pr-2">
                          {status === "unreadable" ? `"${field.raw}"` : formValue}
                          <span className="ml-1 text-xs muted">{STATUS_LABEL[status]}</span>
                        </td>
                        <td className="py-1">
                          {status !== "unreadable" && (
                            <input
                              type="checkbox"
                              aria-label={`Import ${labels.get(field.key) ?? field.key}`}
                              checked={selection.fields[field.key] ?? false}
                              disabled={busy}
                              onChange={(e) =>
                                onSelectionChange(draft.id, { ...selection, fields: { ...selection.fields, [field.key]: e.target.checked } })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {draft.notesToAppend !== "" && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selection.notes}
                  disabled={busy}
                  onChange={(e) => onSelectionChange(draft.id, { ...selection, notes: e.target.checked })}
                />
                <span>
                  <span className="muted">Add to notes</span>
                  <pre className="mt-1 whitespace-pre-wrap font-sans">{draft.notesToAppend}</pre>
                </span>
              </label>
            )}
          </div>
        );
      })}

      {blocks.missingName.length > 0 ? (
        <p className="text-sm text-[var(--red)]">Give every form a performer before importing.</p>
      ) : (
        cardBlocked && <p className="text-sm text-[var(--red)]">Fix the forms marked in red before importing.</p>
      )}
      <button
        type="button"
        onClick={onImport}
        disabled={busy || importable.length === 0 || blocks.missingName.length > 0 || cardBlocked}
        className="btn-primary"
      >
        {importing ? "Importing…" : `Import ${importable.length} ${importable.length === 1 ? "form" : "forms"}`}
      </button>
    </div>
  );
}
