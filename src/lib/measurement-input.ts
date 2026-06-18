export interface MeasurementInputDef {
  key: string;
  unit: string;
  input_type: string;
}

export interface MeasurementPayload {
  measurementKey: string;
  unit: string;
  valueNumeric?: number;
  valueText?: string;
}

// Build the PUT body for one measurement field, or null when the field is blank
// (nothing to save). Text defs save a trimmed string; everything else saves a number.
export function measurementPayload(def: MeasurementInputDef, raw: string): MeasurementPayload | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (def.input_type === "text") {
    return { measurementKey: def.key, unit: def.unit, valueText: trimmed };
  }
  return { measurementKey: def.key, unit: def.unit, valueNumeric: Number(trimmed) };
}
