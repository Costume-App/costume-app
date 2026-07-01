import { expect, test } from "vitest";
import { FEATURES, LANDING, PRICING_TIERS } from "@/components/landing/landing-content";

const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "per", "the", "to", "with",
]);

// Title Case: every significant word starts uppercase; minor words may stay
// lowercase (except as the first word).
function isTitleCase(text: string): boolean {
  return text.split(/\s+/).every((word, i) => {
    const w = word.replace(/[^A-Za-z]/g, "");
    if (!w) return true;
    if (i > 0 && MINOR_WORDS.has(w.toLowerCase())) return true;
    return w[0] === w[0].toUpperCase();
  });
}

test("feature card titles are Title Case", () => {
  for (const f of FEATURES) {
    expect(isTitleCase(f.title), `not title case: "${f.title}"`).toBe(true);
  }
});

test("pricing tier names are exactly as approved", () => {
  expect(PRICING_TIERS.map((t) => t.name)).toEqual(["Pay Per Production", "Unlimited"]);
});

test("landing copy contains no AI references", () => {
  const strings = [
    LANDING.brand, LANDING.titleLead, LANDING.titleAccent, LANDING.tagline, LANDING.eyebrow,
    ...FEATURES.flatMap((f) => [f.title, f.blurb]),
    ...PRICING_TIERS.flatMap((t) => [t.name, t.cadence, ...t.points]),
  ];
  for (const s of strings) {
    expect(s, `AI reference in: "${s}"`).not.toMatch(/\bAI\b/i);
  }
});

test("fabric estimates card matches Nada's wording", () => {
  const fabric = FEATURES.find((f) => f.id === "ai-fabric");
  expect(fabric?.title).toBe("Automatic Fabric Estimates");
  expect(fabric?.blurb.endsWith("automatically.")).toBe(true);
});
