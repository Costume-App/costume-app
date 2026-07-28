// Fabric yardage for skirts, computed from the performer's measurements.
//
// This exists because a skirt's fabric requirement is a closed-form function of
// two measurements and the fabric width — so arithmetic beats the AI estimator
// (src/lib/ai/estimate-fabric.ts) at it: reproducible, explainable, free, and it
// cannot hallucinate. Pieces with no construction set stay on the AI path.
//
// The math is standard drafting geometry, not a formula supplied by Nada — hers
// could not be found. It is validated against the one figure we have from her:
// a full circle skirt at 27" waist / 32" length on 45" goods, which she puts at
// 4 yards and this puts at 4.14 before allowance. See the design spec.
//
// Pure: no I/O, no framework imports. All of this feature's real risk lives here,
// which is why it is a separate module.

export type SkirtConstruction =
  | "full_circle"
  | "three_quarter_circle"
  | "half_circle"
  | "gathered";

export const SKIRT_CONSTRUCTIONS: SkirtConstruction[] = [
  "full_circle",
  "three_quarter_circle",
  "half_circle",
  "gathered",
];

export const CONSTRUCTION_LABELS: Record<SkirtConstruction, string> = {
  full_circle: "Full circle",
  three_quarter_circle: "Three-quarter circle",
  half_circle: "Half circle",
  gathered: "Gathered",
};

export interface SkirtYardageInput {
  construction: SkirtConstruction;
  waistInches: number;
  lengthInches: number; // waist to hem
  fabricWidthInches: number;
  fullness?: number; // gathered only: 2, 2.5, or 3
}

export interface SkirtYardageResult {
  yards: number; // rounded up to the next quarter yard
  steps: string[]; // one line per stage, shown to the user
  warning?: string;
}

const HEM_ALLOWANCE_IN = 1;
const WAIST_SEAM_IN = 1;
// Unusable edge on both sides together. Load-bearing at boundaries: when 2R sits
// near the usable width this constant flips the layout and nearly doubles the
// answer. That is how cutting fabric actually behaves, not a modelling artifact.
const SELVAGE_IN = 2;
const WASTE_ALLOWANCE = 0.1;
const ROUND_TO_YARDS = 0.25;
const DEFAULT_FULLNESS = 2;

const CIRCLE_FRACTION: Record<Exclude<SkirtConstruction, "gathered">, number> = {
  full_circle: 1,
  three_quarter_circle: 0.75,
  half_circle: 0.5,
};

export function isSkirtConstruction(v: unknown): v is SkirtConstruction {
  return typeof v === "string" && (SKIRT_CONSTRUCTIONS as string[]).includes(v);
}

// Fabric widths are stored as free text from the org's Fabric settings — `45"`,
// `60`, `54 in`. Take the leading number; null when there isn't one.
export function parseWidthInches(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function requirePositive(name: string, n: number): void {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

export function estimateSkirtYardage(input: SkirtYardageInput): SkirtYardageResult {
  requirePositive("Waist", input.waistInches);
  requirePositive("Length", input.lengthInches);
  requirePositive("Fabric width", input.fabricWidthInches);

  const usableWidth = input.fabricWidthInches - SELVAGE_IN;
  if (usableWidth <= 0) {
    throw new Error(`Fabric width must be more than ${SELVAGE_IN}" of selvage`);
  }

  const steps: string[] = [];
  let inches: number;
  let warning: string | undefined;

  if (input.construction === "gathered") {
    const fullness = input.fullness ?? DEFAULT_FULLNESS;
    if (input.fullness == null) {
      steps.push(`No fullness set — assuming ${DEFAULT_FULLNESS}× the waist.`);
    }
    requirePositive("Fullness", fullness);
    const panelWidth = input.waistInches * fullness;
    const panels = Math.ceil(panelWidth / usableWidth);
    const panelLength = input.lengthInches + HEM_ALLOWANCE_IN + WAIST_SEAM_IN;
    inches = panels * panelLength;
    steps.push(`Gathered · ${input.fabricWidthInches}" fabric (${usableWidth}" usable)`);
    steps.push(`waist ${input.waistInches}" × ${fullness} fullness = ${r2(panelWidth)}" to gather`);
    steps.push(`${r2(panelWidth)}" ÷ ${usableWidth}" usable → ${plural(panels, "panel")} (rounded up)`);
    steps.push(
      `${panels} × (length ${input.lengthInches}" + hem ${HEM_ALLOWANCE_IN}" + seam ${WAIST_SEAM_IN}") = ${r2(inches)}"`,
    );
  } else {
    const f = CIRCLE_FRACTION[input.construction];
    const waistRadius = input.waistInches / (2 * Math.PI * f);
    const outerRadius = waistRadius + input.lengthInches + HEM_ALLOWANCE_IN;
    const panels = 4 * f;

    // Each panel needs an outerRadius × outerRadius square. How many fit across
    // decides how many rows of fabric the skirt costs: at 2 per row the whole
    // circle is one square (2R); at 1 per row all four stack (4R).
    let perRow = Math.floor(usableWidth / outerRadius);
    if (perRow < 1) {
      perRow = 1;
      warning = `A ${r2(outerRadius)}" panel is wider than the ${usableWidth}" of usable fabric — each panel will need piecing, and the estimate assumes one panel per row.`;
    }
    const rows = Math.ceil(panels / perRow);
    inches = rows * outerRadius;

    steps.push(
      `${CONSTRUCTION_LABELS[input.construction]} · ${input.fabricWidthInches}" fabric (${usableWidth}" usable)`,
    );
    steps.push(`waist ${input.waistInches}" ÷ (2π × ${f}) = ${r2(waistRadius)}" waist radius`);
    steps.push(
      `+ length ${input.lengthInches}" + hem ${HEM_ALLOWANCE_IN}" = ${r2(outerRadius)}" outer radius`,
    );
    steps.push(
      `${plural(panels, "panel")} of ${r2(outerRadius)}", ${perRow} per row = ${plural(rows, "row")}`,
    );
    steps.push(`${rows} × ${r2(outerRadius)}" = ${r2(inches)}"`);
  }

  const rawYards = inches / 36;
  const padded = rawYards * (1 + WASTE_ALLOWANCE);
  const yards = Math.ceil(padded / ROUND_TO_YARDS) * ROUND_TO_YARDS;

  steps.push(`${r2(inches)}" ÷ 36 = ${r2(rawYards)} yd`);
  steps.push(`+ ${Math.round(WASTE_ALLOWANCE * 100)}% allowance = ${r2(padded)} yd`);
  steps.push(`rounded up to the next ¼ yard = ${r2(yards)} yd`);

  return { yards: r2(yards), steps, warning };
}
