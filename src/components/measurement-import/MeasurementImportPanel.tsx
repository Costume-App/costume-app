"use client";

import { useEffect, useRef, useState } from "react";
import { MeasurementImportReview } from "@/components/measurement-import/MeasurementImportReview";
import { downscaleImage, isImageFile } from "@/lib/measurement-import/downscale";
import { localIsoDate } from "@/lib/measurement-import/draft";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, MAX_FORMS, UNSUPPORTED_FILE_MESSAGE } from "@/lib/measurement-import/limits";
import { toApplyPayload } from "@/lib/measurement-import/payload";
import { initialSelection, targetChanged, type ParseFailure } from "@/lib/measurement-import/review";
import type { ExistingData, FormDraft, FormSelection, ImportResult, PerformerTarget } from "@/lib/measurement-import/types";

const READ_FAILED = "Couldn't read that photo right now. Try again.";
const IMPORT_FAILED = "Couldn't import the forms. Try again.";
const IMPORT_MAYBE_DONE = "The import may have finished. Reload the page to check before trying again.";
const TOO_LARGE = "That file is still over 4 MB after shrinking. Take the photo again at a lower resolution.";
const PDF_TOO_LARGE = "That PDF is over 4 MB. Save it at a smaller size, or upload a photo of the form instead.";

// Import measurement forms: choose photos, each is read in turn, review every value, import once.
export function MeasurementImportPanel({
  productionId,
  onImported,
  onClose,
}: {
  productionId: string;
  onImported: (performers: { id: string; name: string }[], result: ImportResult) => void;
  onClose: () => void;
}) {
  const [existing, setExisting] = useState<ExistingData | null>(null);
  const [order, setOrder] = useState<string[]>([]); // upload order, so cards keep their places
  const [drafts, setDrafts] = useState<FormDraft[]>([]);
  const [selections, setSelections] = useState<Record<string, FormSelection>>({});
  const [failures, setFailures] = useState<ParseFailure[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<string, File>());
  // Object URLs for the card thumbnails, held here too so unmount can revoke every one of them.
  const thumbUrls = useRef(new Map<string, string>());
  // The workspace can unmount this panel mid-read (Combine duplicates, Import cast list). Stop the
  // read loop there, so no further paid parse calls go out and no URL outlives the cleanup.
  const alive = useRef(true);
  const reads = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/productions/${productionId}/measurement-import/context`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { existing?: ExistingData; error?: string };
        if (cancelled) return;
        if (res.ok && data.existing) setExisting(data.existing);
        else setError(data.error ?? "Couldn't load the cast. Reload and try again.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the cast. Reload and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [productionId]);

  useEffect(() => {
    const urls = thumbUrls.current;
    const controller = new AbortController();
    alive.current = true;
    reads.current = controller;
    return () => {
      alive.current = false;
      controller.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function addThumb(id: string, file: File) {
    if (!alive.current || !isImageFile(file)) return; // PDFs get no thumbnail
    const url = URL.createObjectURL(file);
    thumbUrls.current.set(id, url);
    setThumbs((prev) => ({ ...prev, [id]: url }));
  }

  function dropThumb(id: string) {
    const url = thumbUrls.current.get(id);
    if (url === undefined) return;
    URL.revokeObjectURL(url);
    thumbUrls.current.delete(id);
    setThumbs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function readOne(id: string, file: File, snapshot: ExistingData) {
    const form = new FormData();
    form.set("file", file);
    form.set("today", localIsoDate(new Date()));
    try {
      const res = await fetch(`/api/productions/${productionId}/measurement-import/parse`, {
        method: "POST",
        credentials: "include",
        body: form,
        signal: reads.current?.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { draft?: FormDraft; error?: string };
      if (!alive.current) return;
      if (res.ok && data.draft) {
        const draft = { ...data.draft, id };
        setDrafts((prev) => [...prev, draft]);
        setSelections((prev) => ({ ...prev, [id]: initialSelection(draft, snapshot) }));
        pending.current.delete(id);
        return;
      }
      // 500 and 502 are transient (the AI service or the server hiccuped); 501 means not set up,
      // and 4xx means this file will fail the same way again.
      const retryable = res.status === 500 || res.status === 502;
      setFailures((prev) => [...prev, { id, fileName: file.name, message: data.error ?? READ_FAILED, retryable }]);
    } catch (err) {
      if (!alive.current || (err instanceof DOMException && err.name === "AbortError")) return; // panel closed
      setFailures((prev) => [...prev, { id, fileName: file.name, message: READ_FAILED, retryable: true }]);
    }
  }

  async function chooseFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!existing || picked.length === 0) return;
    if (drafts.length + failures.length + picked.length > MAX_FORMS) {
      setError(`Import up to ${MAX_FORMS} forms at a time.`);
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ done: 0, total: picked.length });
    for (const [i, raw] of picked.entries()) {
      if (!alive.current) return;
      const id = crypto.randomUUID();
      setOrder((prev) => [...prev, id]);
      const dot = raw.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : raw.name.slice(dot).toLowerCase();
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setFailures((prev) => [...prev, { id, fileName: raw.name, message: UNSUPPORTED_FILE_MESSAGE, retryable: false }]);
      } else {
        const file = await downscaleImage(raw);
        if (!alive.current) return;
        if (file.size > MAX_FILE_BYTES) {
          const message = isImageFile(file) ? TOO_LARGE : PDF_TOO_LARGE;
          setFailures((prev) => [...prev, { id, fileName: raw.name, message, retryable: false }]);
        } else {
          pending.current.set(id, file);
          addThumb(id, file);
          await readOne(id, file, existing);
        }
      }
      setProgress({ done: i + 1, total: picked.length });
    }
    setProgress(null);
    setBusy(false);
  }

  async function retry(id: string) {
    const file = pending.current.get(id);
    if (!file || !existing) return;
    setFailures((prev) => prev.filter((f) => f.id !== id));
    setBusy(true);
    await readOne(id, file, existing);
    setBusy(false);
  }

  function remove(id: string) {
    pending.current.delete(id);
    dropThumb(id);
    setOrder((prev) => prev.filter((x) => x !== id));
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setFailures((prev) => prev.filter((f) => f.id !== id));
    setSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function changePerformer(draftId: string, target: PerformerTarget) {
    if (!existing) return;
    const current = drafts.find((d) => d.id === draftId);
    if (!current) return;
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, performer: target } : d)));
    // The diff depends on who is chosen, so a different performer gets fresh ticks. Typing the new
    // performer's name is the same choice and keeps whatever the user ticked.
    if (targetChanged(current.performer, target)) {
      setSelections((prev) => ({ ...prev, [draftId]: initialSelection({ ...current, performer: target }, existing) }));
    }
  }

  async function importAll() {
    setBusy(true);
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/measurement-import/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toApplyPayload(drafts, selections)),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: ImportResult;
        performers?: { id: string; name: string }[];
        error?: string;
      };
      if (res.ok && data.result && data.performers) {
        onImported(data.performers, data.result); // the parent closes this panel
        return;
      }
      // A 5xx may mean the transaction committed before the response failed: don't invite a
      // duplicating retry. 4xx is a clean rejection and safe to retry.
      setError(res.status >= 500 ? IMPORT_MAYBE_DONE : data.error ?? IMPORT_FAILED);
    } catch {
      setError(IMPORT_MAYBE_DONE);
    }
    setImporting(false);
    setBusy(false);
  }

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Import measurement forms</h2>
        <button type="button" onClick={onClose} disabled={busy} className="link-muted text-sm">
          Close
        </button>
      </div>

      <p className="text-sm muted">
        Photograph each filled-in Costume Measurement Form, one performer per photo. Each photo is read, then you check every
        value before anything is saved.
      </p>

      <label className="block text-sm">
        <span className="btn-primary inline-block cursor-pointer">{drafts.length === 0 ? "Choose photos" : "Add more photos"}</span>
        <input
          type="file"
          className="sr-only"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          multiple
          disabled={busy || !existing}
          onChange={chooseFiles}
        />
      </label>

      {progress && (
        <p className="text-sm muted" role="status">
          Reading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </p>
      )}
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      {existing && (drafts.length > 0 || failures.length > 0) && (
        <MeasurementImportReview
          order={order}
          drafts={drafts}
          existing={existing}
          selections={selections}
          failures={failures}
          thumbs={thumbs}
          busy={busy}
          importing={importing}
          onSelectionChange={(id, selection) => setSelections((prev) => ({ ...prev, [id]: selection }))}
          onPerformerChange={changePerformer}
          onRemove={remove}
          onRetry={retry}
          onImport={importAll}
        />
      )}
    </section>
  );
}
