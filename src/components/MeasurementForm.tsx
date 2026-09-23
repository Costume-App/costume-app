"use client";

import { useState } from "react";
import { splitHeight, combineHeight } from "@/lib/height";
import { measurementPayload, parseMeasurementNumber } from "@/lib/measurement-input";
import { BodyDiagram } from "@/components/BodyDiagram";
import { usePendingSaves } from "@/components/PendingSaves";

type SaveStatus = "saving" | "saved" | "error" | "invalid";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saving: "Saving",
  saved: "Saved",
  error: "Couldn't save",
  invalid: "Couldn't read that number",
};

interface Definition {
  key: string;
  label: string;
  unit: string;
  input_type: string;
  help_text: string | null;
}

export function MeasurementForm({
  performerId,
  definitions,
  initialValues,
}: {
  performerId: string;
  definitions: Definition[];
  initialValues: Record<string, number | string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const d of definitions) {
      v[d.key] = d.key in initialValues ? String(initialValues[d.key]) : "";
    }
    return v;
  });
  const [saved, setSaved] = useState<Record<string, SaveStatus>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pendingSaves = usePendingSaves();

  const initialHeight = splitHeight(Number(initialValues.height ?? 0));
  const [heightFeet, setHeightFeet] = useState(
    "height" in initialValues ? String(initialHeight.feet) : "",
  );
  const [heightInches, setHeightInches] = useState(
    "height" in initialValues ? String(initialHeight.inches) : "",
  );

  function saveHeight() {
    pendingSaves.track(persistHeight());
  }

  async function persistHeight() {
    if (heightFeet.trim() === "" && heightInches.trim() === "") return;
    const heightDef = definitions.find((d) => d.key === "height");
    if (!heightDef) return;
    const feet = heightFeet.trim() === "" ? 0 : parseMeasurementNumber(heightFeet);
    const inches = heightInches.trim() === "" ? 0 : parseMeasurementNumber(heightInches);
    if (feet === null || inches === null) {
      setSaved((s) => ({ ...s, height: "invalid" }));
      return;
    }
    const total = combineHeight(feet, inches);
    setSaved((s) => ({ ...s, height: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ measurementKey: "height", valueNumeric: total, unit: heightDef.unit }),
    });
    setSaved((s) => ({ ...s, height: res.ok ? "saved" : "error" }));
    setValues((v) => ({ ...v, height: String(total) }));
  }

  function save(def: Definition, raw: string) {
    pendingSaves.track(persist(def, raw));
  }

  async function persist(def: Definition, raw: string) {
    const result = measurementPayload(def, raw);
    if (result.kind === "blank") return; // nothing to save for an empty field
    if (result.kind === "invalid") {
      setSaved((s) => ({ ...s, [def.key]: "invalid" }));
      return;
    }
    const payload = result.payload;
    setSaved((s) => ({ ...s, [def.key]: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    setSaved((s) => ({ ...s, [def.key]: res.ok ? "saved" : "error" }));
  }

  const filledCount = definitions.filter((d) => values[d.key]?.trim() !== "").length;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Measurements</h2>
        <p className="text-sm muted">
          {filledCount} of {definitions.length} measured
        </p>
      </div>
      <details className="surface mb-4 p-3">
        <summary className="cursor-pointer text-sm font-medium">Where do I measure?</summary>
        <div className="mt-3">
          <BodyDiagram activeKey={activeKey ?? undefined} />
        </div>
      </details>
      <div className="border-t border-[var(--field-line)]">
        {definitions.map((def) =>
          def.key === "height" ? (
            <div
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{def.label}</span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  className="field w-16 text-right"
                  value={heightFeet}
                  onChange={(e) => setHeightFeet(e.target.value)}
                  onFocus={() => setActiveKey("height")}
                  onBlur={saveHeight}
                  aria-label="Height (feet)"
                />
                <span className="text-sm muted">ft</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="field w-16 text-right"
                  value={heightInches}
                  onChange={(e) => setHeightInches(e.target.value)}
                  onFocus={() => setActiveKey("height")}
                  onBlur={saveHeight}
                  aria-label="Height (inches)"
                />
                <span className="text-sm muted">in</span>
                {saved[def.key] && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "var(--green)"
                          : saved[def.key] === "error" || saved[def.key] === "invalid"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={STATUS_LABEL[saved[def.key]]}
                    aria-label={STATUS_LABEL[saved[def.key]]}
                  />
                )}
              </span>
            </div>
          ) : def.input_type === "text" ? (
            <label
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{def.label}</span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="relative w-36 shrink-0">
                <input
                  type="text"
                  className="field w-full !pl-6 text-right"
                  placeholder={def.help_text ?? ""}
                  value={values[def.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                  onFocus={() => setActiveKey(def.key)}
                  onBlur={(e) => save(def, e.target.value)}
                />
                {saved[def.key] && (
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "var(--green)"
                          : saved[def.key] === "error" || saved[def.key] === "invalid"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={STATUS_LABEL[saved[def.key]]}
                    aria-label={STATUS_LABEL[saved[def.key]]}
                  />
                )}
              </span>
            </label>
          ) : (
            <label
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {def.label}
                  {"\u00A0"}
                  <span className="muted">({def.unit})</span>
                </span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="relative w-28 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="field w-full !pr-8 !pl-6 text-right"
                  value={values[def.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                  onFocus={() => setActiveKey(def.key)}
                  onBlur={(e) => save(def, e.target.value)}
                />
                {saved[def.key] && (
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "var(--green)"
                          : saved[def.key] === "error" || saved[def.key] === "invalid"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={STATUS_LABEL[saved[def.key]]}
                    aria-label={STATUS_LABEL[saved[def.key]]}
                  />
                )}
                {values[def.key]?.trim() !== "" && (
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm muted">
                    {def.unit}
                  </span>
                )}
              </span>
            </label>
          ),
        )}
      </div>
    </div>
  );
}
