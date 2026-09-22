// Map a handwritten or printed label to one of the app's measurement keys. Exact match on the
// normalized label only: "hip" maps, "hip ankle" does not, so an unknown line never lands on a
// nearby field.

// Printed guidance on the form ("1 above navel") and the A to G letter prefixes carry no meaning.
export function normalizeLabel(label: string): string {
  const stripped = label
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // A single letter a to g followed by a space is the form's line letter, not a word.
  return stripped.replace(/^[a-g] (?=\S)/, "").trim();
}

const ALIASES: Record<string, string> = {
  chest: "chest",
  bust: "chest",
  "chest bust": "chest",
  waist: "waist",
  hip: "hips",
  hips: "hips",
  inseam: "inseam",
  "in seam": "inseam",
  "nape to floor": "nape_to_floor",
  "nape floor": "nape_to_floor",
  height: "height",
  ht: "height",
  "shoulders across back": "shoulder",
  "shoulder across back": "shoulder",
  shoulders: "shoulder",
  shoulder: "shoulder",
  "shoulder width": "shoulder",
  "across back": "shoulder",
  head: "head",
  "head circumference": "head",
  "head circ": "head",
  neck: "neck",
  "nape w": "back_length",
  "nape to waist": "back_length",
  "nape waist": "back_length",
  "back length": "back_length",
  "sh w": "sleeve",
  "sh wr": "sleeve",
  "shoulder to wrist": "sleeve",
  "shoulder wrist": "sleeve",
  sleeve: "sleeve",
  "sleeve length": "sleeve",
  "arm length": "sleeve",
  weight: "weight",
  wt: "weight",
  wrist: "wrist",
  thigh: "thigh",
  knee: "knee",
  arm: "arm_circumference",
  "arm circumference": "arm_circumference",
  bicep: "arm_circumference",
  biceps: "arm_circumference",
  "upper arm": "arm_circumference",
  outseam: "outseam",
  "out seam": "outseam",
  "waist to ankle": "outseam",
  shirt: "shirt_size",
  "shirt size": "shirt_size",
  pant: "pant_size",
  pants: "pant_size",
  "pant size": "pant_size",
  shoe: "shoe_size",
  shoes: "shoe_size",
  "shoe size": "shoe_size",
};

export function resolveKey(label: string): string | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  return ALIASES[normalized] ?? null;
}
