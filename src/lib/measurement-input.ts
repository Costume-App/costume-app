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

export type MeasurementPayloadResult =
  | { kind: "ok"; payload: MeasurementPayload }
  | { kind: "blank" }
  | { kind: "invalid" };

const VULGAR_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

// Read a measurement the way a tailor writes it (typed, or handwritten via Scribble):
// "34.5", "34,5", "34 1/2", "34-1/2", "34½", "1/2", with an optional trailing
// inch mark or "in". Returns null for anything else rather than guessing.
export function parseMeasurementNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s*(?:"|”|in\.?|inches)$/i, "").trim();
  if (s === "") return null;

  let fraction = 0;
  const vulgar = s.slice(-1);
  if (vulgar in VULGAR_FRACTIONS) {
    fraction = VULGAR_FRACTIONS[vulgar];
    s = s.slice(0, -1).trim();
    if (s === "") return fraction;
  } else {
    const mixed = /^(?:(\d+)[\s-]+)?(\d+)\/(\d+)$/.exec(s);
    if (mixed) {
      const den = Number(mixed[3]);
      if (den === 0) return null;
      return Number(mixed[1] ?? 0) + Number(mixed[2]) / den;
    }
  }

  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  return Number(s.replace(",", ".")) + fraction;
}

// Build the PUT body for one measurement field. Text defs save a trimmed string;
// everything else must read as a number, or the field is reported invalid and not sent.
export function measurementPayload(def: MeasurementInputDef, raw: string): MeasurementPayloadResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "blank" };
  if (def.input_type === "text") {
    return { kind: "ok", payload: { measurementKey: def.key, unit: def.unit, valueText: trimmed } };
  }
  const value = parseMeasurementNumber(trimmed);
  if (value === null) return { kind: "invalid" };
  return { kind: "ok", payload: { measurementKey: def.key, unit: def.unit, valueNumeric: value } };
}
