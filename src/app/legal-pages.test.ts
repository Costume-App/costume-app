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
//
// Two known false-positive paths, both acceptable because they fail loudly
// rather than silently:
// - This normalizes the *whole* file, including `import` statements, so a
//   future `@clerk/nextjs` (or similar) import added to one of these pages
//   would trip the vendor-name assertions below for a name no user ever sees.
// - The `/HTTPS/i` assertion in "privacy policy makes no specific security
//   claims" would trip on any absolute `https://` URL added anywhere on the
//   page, not just a claim about transport security.
function copyOf(relPath: string): string {
  const src = readFileSync(path.join(process.cwd(), relPath), "utf8");
  // Hoist title and updated-date props first — tag stripping would otherwise eat them.
  const titles = [...src.matchAll(/(?:title|updated)="([^"]*)"/g)].map((m) => m[1]).join(" ");
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
const TERMS = copyOf("src/app/terms/page.tsx");

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

test("terms route each question to its own address", () => {
  expect(TERMS).toContain("hello@measuremycostume.com");
  expect(TERMS).toContain("billing@measuremycostume.com");
  expect(TERMS).toContain("privacy@measuremycostume.com");
});

test("terms require contractual capacity rather than an unverifiable age", () => {
  expect(TERMS).toContain("binding contract");
  expect(TERMS).toContain("authority to bind that organization");
  expect(TERMS).not.toMatch(/at least 18 years old/i);
});

test("terms keep parent or guardian consent explicit for performers", () => {
  expect(TERMS).toContain("under 18 years of age");
});

test("both pages promise the same deletion window", () => {
  expect(TERMS).toContain("within 30 days");
  expect(PRIVACY).toContain("within 30 days");
});

test("both pages show the same last-updated date", () => {
  expect(PRIVACY).toContain("July 27, 2026");
  expect(TERMS).toContain("July 27, 2026");
});

test("privacy page nav anchors all resolve to a real section", () => {
  // Raw source, not the normalized prose above — anchor and id attributes are
  // stripped out of `copyOf`'s output, so this needs the actual JSX.
  const raw = readFileSync(path.join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
  const hrefs = [...raw.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = [...raw.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

  expect(hrefs).toHaveLength(9);
  for (const href of hrefs) {
    expect(ids, `nav links to #${href}, but no section has that id`).toContain(href);
  }
  expect(hrefs).not.toContain("providers");
  expect(hrefs).not.toContain("security");
});

test("Clerk provider is wired to CLERK_LOCALIZATION", () => {
  const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
  expect(layout).toContain('import { CLERK_LOCALIZATION } from "@/lib/clerk-localization"');
  expect(layout).toContain("localization={CLERK_LOCALIZATION}");
});

test("privacy policy covers reading imported cast lists among service-provider functions", () => {
  expect(PRIVACY).toContain("automated fabric estimates, and reading cast lists you import");
});
