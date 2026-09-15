"use client";

import { useState } from "react";
import { CastImportReview } from "@/components/cast-import/CastImportReview";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "@/lib/cast-import/limits";
import { toApplyPayload } from "@/lib/cast-import/payload";
import type { Draft, ExistingData, ImportCounts, WorkspaceSnapshot } from "@/lib/cast-import/types";

const READ_FAILED = "Couldn't read the cast list right now — try again.";
const IMPORT_FAILED = "Couldn't import the cast list — try again.";
const IMPORT_MAYBE_DONE = "The import may have finished — reload the page to check before trying again.";
const UNSUPPORTED_TYPE = "Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text, PNG or JPG file.";

// Import a cast list: paste or upload → AI reads it → review → one-transaction import.
export function CastImportPanel({
  productionId,
  onImported,
  onClose,
}: {
  productionId: string;
  onImported: (workspace: WorkspaceSnapshot, counts: ImportCounts) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [existing, setExisting] = useState<ExistingData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (picked) {
      const dot = picked.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : picked.name.slice(dot).toLowerCase();
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setError(UNSUPPORTED_TYPE);
        setFile(null);
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        setError("Files must be 4 MB or smaller.");
        setFile(null);
        return;
      }
    }
    setError(null);
    setFile(picked);
  }

  async function read() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (file) form.set("file", file);
    else form.set("text", text);
    try {
      const res = await fetch(`/api/productions/${productionId}/cast-import/parse`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { draft?: Draft; existing?: ExistingData; error?: string };
      if (res.ok && data.draft && data.existing) {
        setDraft(data.draft);
        setExisting(data.existing);
      } else {
        setError(data.error ?? READ_FAILED);
      }
    } catch {
      setError(READ_FAILED);
    }
    setBusy(false);
  }

  async function importDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/cast-import/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toApplyPayload(draft)),
      });
      const data = (await res.json().catch(() => ({}))) as {
        counts?: ImportCounts;
        workspace?: WorkspaceSnapshot;
        error?: string;
      };
      if (res.ok && data.counts && data.workspace) {
        onImported(data.workspace, data.counts); // the parent closes this panel
        return;
      }
      // A 5xx may mean the transaction committed before the response failed — don't invite a
      // duplicating retry. 4xx is a clean rejection (validation/conflict/not-found): safe to retry.
      setError(res.status >= 500 ? IMPORT_MAYBE_DONE : data.error ?? IMPORT_FAILED);
    } catch {
      // Same reasoning: a network error after the request went out doesn't mean it didn't apply.
      setError(IMPORT_MAYBE_DONE);
    }
    setBusy(false);
  }

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Import cast list</h2>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Close
        </button>
      </div>

      {draft && existing ? (
        <CastImportReview
          draft={draft}
          existing={existing}
          busy={busy}
          onChange={setDraft}
          onImport={importDraft}
          onStartOver={() => {
            setDraft(null);
            setExisting(null);
            setError(null);
          }}
        />
      ) : (
        <div className="space-y-3">
          <textarea
            className="field min-h-40 w-full"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            disabled={busy || file !== null}
            aria-label="Cast list text"
            placeholder="Paste the cast list — copied from a spreadsheet, document or email"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="btn-ghost cursor-pointer">
              {file ? "Choose a different file" : "…or upload a file"}
              <input
                type="file"
                className="sr-only"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                onChange={chooseFile}
                disabled={busy}
              />
            </label>
            {file && (
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={() => {
                    setFile(null);
                    setError(null);
                  }}
                  disabled={busy}
                  className="link-muted"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          <p className="text-xs muted">
            PDF, Word, Excel, CSV, text or a photo. The list is read by AI to fill in the review. Nothing is
            saved until you import.
          </p>
          <button
            type="button"
            onClick={read}
            disabled={busy || (!file && !text.trim())}
            className="btn-primary"
          >
            {busy ? "Reading cast list…" : "Read cast list"}
          </button>
        </div>
      )}

      {error && <p className="text-[var(--red)]">{error}</p>}
    </section>
  );
}
