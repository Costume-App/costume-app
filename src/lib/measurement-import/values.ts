import { MAX_TEXT_VALUE, MIN_BARE_HEIGHT_INCHES } from "@/lib/measurement-import/limits";

const FRACTION_GLYPHS: Record<string, string> = {
  "¼": " 1/4",
  "½": " 1/2",
  "¾": " 3/4",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

// Lowercase, straighten quotes, expand fraction glyphs, collapse whitespace.
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[¼½¾⅛-⅞]/g, (g) => FRACTION_GLYPHS[g] ?? g)
    .replace(/\s+/g, " ")
    .trim();
}

// "36", "36.5", "24 1/4", "1/2" as a positive number; anything else is null.
function parseMixedNumber(text: string): number | null {
  const mixed = /^(\d+(?:\.\d+)?)(?: (\d+)\/(\d+))?$/.exec(text);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = mixed[2] ? Number(mixed[2]) : 0;
    const den = mixed[3] ? Number(mixed[3]) : 1;
    if (den === 0) return null;
    return positive(whole + num / den);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const den = Number(fraction[2]);
    if (den === 0) return null;
    return positive(Number(fraction[1]) / den);
  }
  return null;
}

function positive(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Strip an inch marker from the end: 36", 36 in, 36 inches, 36inch.
function stripInchMarker(text: string): string {
  return text.replace(/\s*(?:"|in\.?|inch|inches)$/i, "").trim();
}

export function parseInches(raw: string): number | null {
  return parseMixedNumber(stripInchMarker(normalize(raw)));
}

// A feet-and-inches reading, total inches, or null when feet or inches is out of range.
// A person is under 8 feet and inches stays below a foot; either failing means the line was
// misread rather than parsed into a nonsense height.
function feetAndInchesToTotal(feet: number, inches: number): number | null {
  if (feet >= 8 || inches >= 12) return null;
  return positive(feet * 12 + inches);
}

// Height in total inches. Accepts feet-and-inches forms (5'8", 5 ft 8 in, 5-8, 5') and a bare
// number of at least MIN_BARE_HEIGHT_INCHES. Anything else is null so the user types it.
export function parseHeight(raw: string): number | null {
  const text = normalize(raw);
  const feetInches = /^(\d+) ?(?:'|ft\.?|feet|foot) ?(\d+(?:\.\d+)?)? ?(?:"|in\.?|inches)?$/.exec(text);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    return feetAndInchesToTotal(feet, inches);
  }
  const dashed = /^(\d+)-(\d+)$/.exec(text);
  if (dashed) {
    return feetAndInchesToTotal(Number(dashed[1]), Number(dashed[2]));
  }
  const bare = parseMixedNumber(stripInchMarker(text));
  if (bare === null || bare < MIN_BARE_HEIGHT_INCHES) return null;
  return bare;
}

export function parseWeight(raw: string): number | null {
  const text = normalize(raw).replace(/\s*(?:lbs?\.?|pounds?)$/i, "").trim();
  return parseMixedNumber(text);
}

export function parseTextValue(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, MAX_TEXT_VALUE);
}
