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
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {filledCount} of {definitions.length} measured
      </p>
      {definitions.map((def) => (
        <label key={def.key} className="block">
          <span className="mb-1 block font-medium">
            {def.label} <span className="text-gray-400">({def.unit})</span>
          </span>
          {def.help_text && <span className="mb-1 block text-xs text-gray-500">{def.help_text}</span>}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              className="w-full rounded-lg border p-3"
              value={values[def.key]}
              onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
              onBlur={(e) => save(def, e.target.value)}
            />
            <span className="w-14 text-sm text-gray-500">
              {saved[def.key] === "saving" && "Saving…"}
              {saved[def.key] === "saved" && "Saved"}
              {saved[def.key] === "error" && <span className="text-red-600">Error</span>}
            </span>
          </div>
        </label>
      ))}
    </div>
  );
}
