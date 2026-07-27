import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// The legal pages are hand-authored JSX and the suite runs in vitest's "node"
// environment (no jsdom, no @testing-library). Rather than add a DOM stack for
// two static pages, read the source and normalize it into readable prose:
// comments dropped, Section/LegalShell `title` props hoisted out, JSX tags
// stripped, {" "} spacers removed, entities decoded, whitespace collapsed. A
// phrase the formatter wrapped across lines still matches.
//
// These are compliance guards, not copy-editing tests. Every string asserted
// below was required by the 2026-07-27 compliance review — removing one is a
// policy change, not a wording tweak. See
// docs/superpowers/specs/2026-07-27-compliance-legal-revisions-design.md
function copyOf(relPath: string): string {
  const src = readFileSync(path.join(process.cwd(), relPath), "utf8");
  // Hoist title props first — tag stripping would otherwise eat them.
  const titles = [...src.matchAll(/title="([^"]*)"/g)].map((m) => m[1]).join(" ");
  const prose = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/\{"\s*"\}/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&ldquo;|&rdquo;/g, '"');
  return `${titles} ${prose}`.replace(/\s+/g, " ");
}

const PRIVACY = copyOf("src/app/privacy/page.tsx");

test("privacy policy commits to a concrete 30-day deletion window", () => {
  expect(PRIVACY).toContain("within 30 days");
  expect(PRIVACY).not.toMatch(/reasonable period/i);
});

test("privacy policy names CCPA and GDPR rights", () => {
  expect(PRIVACY).toContain("California Consumer Privacy Act (CCPA)");
  expect(PRIVACY).toContain("General Data Protection Regulation (GDPR)");
});

test("privacy policy routes data requests to the privacy address", () => {
  expect(PRIVACY).toContain("privacy@measuremycostume.com");
});

test("privacy policy states retention is governed by record-retention law", () => {
  expect(PRIVACY).toContain("state and federal record-retention laws");
});

test("privacy policy does not name GLBA or the Bank Secrecy Act", () => {
  expect(PRIVACY).not.toMatch(/Gramm|Bank Secrecy/i);
});

test("privacy policy keeps performer consent explicit but drops unverifiable age claims", () => {
  expect(PRIVACY).toContain("under 18 years of age");
  expect(PRIVACY).not.toMatch(/under 13/i);
});

test("privacy policy names no service provider", () => {
  for (const vendor of ["Clerk", "Supabase", "Stripe", "Anthropic", "Resend", "Vercel"]) {
    expect(PRIVACY, `vendor named in privacy policy: ${vendor}`).not.toContain(vendor);
  }
});

test("privacy policy makes no specific security claims", () => {
  expect(PRIVACY).toContain("commercially reasonable");
  expect(PRIVACY).not.toMatch(/HTTPS|signed URL/i);
});
