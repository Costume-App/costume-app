"use client";

import { useState } from "react";

interface Definition {
  key: string;
  label: string;
  unit: string;
  help_text: string | null;
}

export function MeasurementForm({
  performerId,
  definitions,
  initialValues,
}: {
  performerId: string;
  definitions: Definition[];
  initialValues: Record<string, number>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const d of definitions) {
      v[d.key] = d.key in initialValues ? String(initialValues[d.key]) : "";
    }
    return v;
  });
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | "error">>({});

  async function save(def: Definition, raw: string) {
    if (raw.trim() === "") return; // nothing to save for an empty field
    const valueNumeric = Number(raw);
    setSaved((s) => ({ ...s, [def.key]: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ measurementKey: def.key, valueNumeric, unit: def.unit }),
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
      <div className="border-t border-[var(--field-line)]">
        {definitions.map((def) => (
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
                type="number"
                inputMode="decimal"
                step="0.10"
                className="field w-full !pr-8 !pl-6 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={values[def.key]}
                onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                onBlur={(e) => save(def, e.target.value)}
              />
              {/* save-state dot, tucked in the box's empty left side (number is right-aligned) */}
              {saved[def.key] && (
                <span
                  className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                  style={{
                    background:
                      saved[def.key] === "saved"
                        ? "#3f7d4f"
                        : saved[def.key] === "error"
                          ? "var(--red)"
                          : "var(--muted)",
                  }}
                  title={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                  aria-label={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                />
              )}
              {values[def.key]?.trim() !== "" && (
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm muted">
                  {def.unit}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
