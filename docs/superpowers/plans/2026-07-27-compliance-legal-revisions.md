# Compliance Legal Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 2026-07-27 compliance review to the public Terms and Privacy pages, and add a required affirmation checkbox at sign-up.

**Architecture:** Three static-content changes plus one config module. The two legal pages are hand-authored JSX rewritten in place. The sign-up checkbox is Clerk's built-in `legalAccepted` field, enabled by Dashboard configuration and labeled through a `localization` override that lives in its own module so the wording is testable. No database migration, no API change, no new dependencies.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, `@clerk/nextjs` 7.4.3, Vitest (node environment), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-27-compliance-legal-revisions-design.md`

## Global Constraints

- **Three contact addresses, used exactly as assigned:** `hello@measuremycostume.com` (general/support), `billing@measuremycostume.com` (payments), `privacy@measuremycostume.com` (data access, correction, export, deletion, CCPA/GDPR requests).
- **Deletion window is `within 30 days` of a verified request**, worded identically on both pages.
- **Never name a vendor in the Privacy Policy.** `Clerk`, `Supabase`, `Stripe`, `Anthropic`, `Resend`, `Vercel` must not appear. (Terms §7 may still name Stripe as the payment processor — that is intentional and unchanged.)
- **Never name GLBA or the Bank Secrecy Act.** Retention language commits to "applicable state and federal record-retention laws, including those that apply to financial records." Naming GLBA would assert Measure My Costume is a financial institution under that act, which it is not.
- **CCPA and GDPR are named in full, with the acronym in parentheses on first use.**
- **No new dependencies.** No jsdom, no `@testing-library/*`, no `@clerk/types`.
- **No database migration.** Nothing in this plan touches Supabase.
- **`LEGAL_LINKS` in `src/components/landing/landing-content.ts` stays exported and unmodified** — the landing footer consumes it and `landing-content.test.ts` asserts it.
- **This is Next.js 16.** Per `AGENTS.md`, check `node_modules/next/dist/docs/` before assuming older App Router patterns. Nothing in this plan needs a routing or middleware change.
- **Do not push or deploy.** Local commits only, on branch `feat/compliance-legal-revisions`, until Chris gives an explicit green light.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/legal-pages.test.ts` *(create)* | Compliance guard over both legal pages' source copy |
| `src/app/privacy/page.tsx` *(modify)* | Privacy Policy content |
| `src/app/terms/page.tsx` *(modify)* | Terms of Service content |
| `src/lib/clerk-localization.ts` *(create)* | Clerk UI copy overrides — holds the sign-up affirmation wording |
| `src/lib/clerk-localization.test.ts` *(create)* | Guard over the affirmation wording |
| `src/app/layout.tsx` *(modify)* | Pass the localization to `ClerkProvider` |
| `src/app/sign-up/[[...sign-up]]/page.tsx` *(modify)* | Drop the now-redundant passive consent paragraph |

### Why the tests read source instead of rendering

`vitest.config.ts` sets `environment: "node"` and the repo has no jsdom and no `@testing-library/react` — there are zero `.test.tsx` files. Adding a DOM stack to assert on two static pages is not worth it. The tests instead read each page's source and normalize it into readable prose: comments dropped, `title=` props hoisted out, JSX tags stripped, `{" "}` spacers removed, entities decoded, whitespace collapsed. A phrase the formatter wrapped across three lines still matches.

This follows existing precedent — `src/components/landing/landing-content.test.ts` already guards approved marketing copy the same way, just against a data module rather than JSX.

---

### Task 1: Privacy Policy rewrite

**Files:**
- Create: `src/app/legal-pages.test.ts`
- Modify: `src/app/privacy/page.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `B`, `LegalShell`, `LI`, `P`, `Section`, `UL` from `@/components/legal/LegalPage` (already imported by the page).
- Produces: `src/app/legal-pages.test.ts` exports nothing, but Task 2 appends to it and reuses its `copyOf(relPath: string): string` helper and its module-level `const TERMS`. Do not rename either.

- [ ] **Step 1: Write the failing test**

Create `src/app/legal-pages.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/legal-pages.test.ts`

Expected: FAIL. Several assertions break against the current page — no `within 30 days`, no CCPA/GDPR text, `reasonable period` still present, `under 13` still present, and the vendor loop fails on `Clerk`.

- [ ] **Step 3: Rewrite the Privacy Policy**

Replace the whole of `src/app/privacy/page.tsx` with:

```tsx
import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy Policy" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
// Copy is guarded by src/app/legal-pages.test.ts — the statutory commitments in
// here are the product of a compliance review, not free-form marketing copy.
export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="July 27, 2026"
      intro="What Measure My Costume collects, why, and how it is handled."
    >
      <nav className="surface p-4 text-sm">
        <span className="lbl block">On this page</span>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><a href="#collect" className="link-muted">What we collect</a></li>
          <li><a href="#performers" className="link-muted">Performers &amp; minors</a></li>
          <li><a href="#use" className="link-muted">How we use information</a></li>
          <li><a href="#sharing" className="link-muted">Sharing</a></li>
          <li><a href="#safeguards" className="link-muted">Safeguards</a></li>
          <li><a href="#retention" className="link-muted">Retention &amp; deletion</a></li>
          <li><a href="#rights" className="link-muted">Your rights</a></li>
          <li><a href="#cookies" className="link-muted">Cookies</a></li>
          <li><a href="#changes" className="link-muted">Changes &amp; contact</a></li>
        </ul>
      </nav>

      <Section id="collect" title="What we collect">
        <P>We collect only what is necessary to facilitate your use of the app.</P>
        <UL>
          <LI>
            <B>Account information</B> — what is needed to create and verify your account and to
            bill you.
          </LI>
          <LI>
            <B>Organization content</B> — the production and costume information your team enters
            to plan a show.
          </LI>
          <LI>
            <B>Technical basics</B> — sign-in session cookies and standard server logs that keep
            the service working.
          </LI>
        </UL>
      </Section>

      <Section id="performers" title="Performers and minors">
        <P>
          Performer information is entered by your organization, and your organization is
          responsible for having consent to store it, including consent from a parent or guardian
          for any performer under 18 years of age. We process that information only to run the
          service for your organization. It is never used for advertising.
        </P>
      </Section>

      <Section id="use" title="How we use information">
        <P>
          We use the information we collect to operate the service for your organization, to
          verify accounts and process billing, to send service-related email such as invitations
          and support replies, and to respond to your requests.
        </P>
        <P>We do not sell personal information, and we show no advertising.</P>
      </Section>

      <Section id="sharing" title="Sharing">
        <P>We do not sell or rent your information.</P>
        <P>
          We use third-party service providers to operate the service — for hosting, account
          sign-in, payment processing, email delivery, and automated fabric estimates. Each
          receives only the information it needs to perform its function on our behalf. Beyond
          that, we share information only where the law requires it.
        </P>
        <P>
          If your organization shares a production with another organization using a share link,
          only the design layer is copied — roles, costume designs, notes, and design photos.{" "}
          <B>Performer names and measurements are never included.</B>
        </P>
      </Section>

      <Section id="safeguards" title="Safeguards">
        <P>
          We use commercially reasonable administrative, technical, and physical safeguards to
          protect the information we hold. Payment card details are handled by our payment
          processor and are never stored on our systems.
        </P>
      </Section>

      <Section id="retention" title="Retention and deletion">
        <P>We keep your organization&rsquo;s data while the organization is active.</P>
        <P>
          We retain information, including payment and billing records, for as long as necessary
          to provide the service and to comply with applicable state and federal record-retention
          laws, including those that apply to financial records. Some records must be kept after
          an account closes for that reason.
        </P>
        <P>
          To delete your organization and its data, email{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will remove it within 30 days of a verified request, except for records we are
          required by law to retain.
        </P>
      </Section>

      <Section id="rights" title="Your rights">
        <P>You can view and update most information directly in the app.</P>
        <P>
          If you are a California resident, the California Consumer Privacy Act (CCPA) gives you
          the right to know what personal information we collect and how it is used, to request a
          copy of it, to request its deletion, and not to be treated differently for exercising
          those rights. We do not sell personal information.
        </P>
        <P>
          If you are in the European Economic Area or the United Kingdom, the General Data
          Protection Regulation (GDPR) gives you the right to access, correct, export, restrict,
          or delete your personal information, and to object to certain processing. For the
          content your team enters, your organization is the data controller and we act as its
          processor — direct those requests to your organization first, and we will assist it in
          responding.
        </P>
        <P>
          To exercise any of these rights, email{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will respond within 30 days.
        </P>
      </Section>

      <Section id="cookies" title="Cookies">
        <P>
          We use cookies only to keep you signed in and, briefly, to resume a checkout you
          started. There are no advertising trackers and no third-party analytics.
        </P>
      </Section>

      <Section id="changes" title="Changes and contact">
        <P>
          If this policy changes, we will post the new version here with an updated date and
          notify you of material changes by email or in the app. Questions? Email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          .
        </P>
      </Section>

      <p className="border-t border-[var(--field-line)] pt-4 text-sm muted">
        See also our <Link href="/terms" className="link-red">Terms of Service</Link>.
      </p>
    </LegalShell>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/legal-pages.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: both clean. If `tsc` complains about an unused import, the rewrite dropped a component that is still imported — remove it from the import list. (`Link`, `B`, `LegalShell`, `LI`, `P`, `Section`, and `UL` are all still used above, so this should not happen.)

- [ ] **Step 6: Commit**

```bash
git add src/app/legal-pages.test.ts src/app/privacy/page.tsx
git commit -m "feat(legal): compliance rewrite of the Privacy Policy

Genericize collection, use, providers, and security language; add CCPA and
GDPR rights; commit to a 30-day deletion window; route data requests to
privacy@; drop the unverifiable under-13 claim. Guarded by a copy test."
```

---

### Task 2: Terms of Service edits

**Files:**
- Modify: `src/app/terms/page.tsx` (§1, §5, §7, §9, §13, and the `updated` date)
- Modify: `src/app/legal-pages.test.ts` (append Terms assertions)

**Interfaces:**
- Consumes: `copyOf(relPath: string): string` from `src/app/legal-pages.test.ts`, created in Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

In `src/app/legal-pages.test.ts`, add `const TERMS = copyOf("src/app/terms/page.tsx");` directly below the existing `const PRIVACY = ...` line, then append these tests to the end of the file:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/legal-pages.test.ts`

Expected: FAIL. The current Terms page has no `billing@` or `privacy@` address, no `binding contract` language, and still says "You must be at least 18 years old to create an account."

- [ ] **Step 3: Apply the five edits**

**3a — `updated` prop.** Change `updated="July 15, 2026"` to `updated="July 27, 2026"`.

**3b — §1.** Replace the second `<P>` of the `agreement` section — currently `<P>You must be at least 18 years old to create an account.</P>` — with:

```tsx
        <P>
          You must be old enough to enter into a binding contract where you live. If you create an
          account on behalf of an organization, you confirm that you have authority to bind that
          organization to these terms. You confirm both when you create your account.
        </P>
```

**3c — §5.** In the `performers` section, change the phrase `including consent from a parent or guardian for performers under 18.` to `including consent from a parent or guardian for any performer under 18 years of age.` Leave the rest of the paragraph alone.

**3d — §7.** In the `payments` section, add a second `<P>` after the existing one:

```tsx
        <P>
          Questions about billing? Email{" "}
          <a href="mailto:billing@measuremycostume.com" className="link-red">
            billing@measuremycostume.com
          </a>
          .
        </P>
```

**3e — §9.** Replace the whole `<P>` in the `ending` section with:

```tsx
        <P>
          You can stop using the service at any time, and you can ask us to delete your
          organization and its data by emailing{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will remove it within 30 days of a verified request, except for records we are
          required by law to retain. We may suspend or close accounts that violate these terms,
          with notice where practical.
        </P>
```

**3f — §13.** Replace the whole body of the `contact` section with:

```tsx
        <P>Reach us at the address that matches your question:</P>
        <UL>
          <LI>
            <B>General questions</B> —{" "}
            <a href="mailto:hello@measuremycostume.com" className="link-red">
              hello@measuremycostume.com
            </a>
          </LI>
          <LI>
            <B>Billing</B> —{" "}
            <a href="mailto:billing@measuremycostume.com" className="link-red">
              billing@measuremycostume.com
            </a>
          </LI>
          <LI>
            <B>Privacy and data requests</B> —{" "}
            <a href="mailto:privacy@measuremycostume.com" className="link-red">
              privacy@measuremycostume.com
            </a>
          </LI>
        </UL>
```

`UL`, `LI`, and `B` are already in the page's import list — no import change needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/legal-pages.test.ts`

Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/terms/page.tsx src/app/legal-pages.test.ts
git commit -m "feat(legal): compliance edits to the Terms of Service

Replace the unverifiable 18+ claim with contractual capacity and authority to
bind the organization; make parent or guardian consent explicit for performers
under 18; split contact into hello@, billing@, and privacy@; match the Privacy
Policy's 30-day deletion window."
```

---

### Task 3: Sign-up affirmation checkbox

**Files:**
- Create: `src/lib/clerk-localization.ts`
- Create: `src/lib/clerk-localization.test.ts`
- Modify: `src/app/layout.tsx:3` (import) and `src/app/layout.tsx:25` (`ClerkProvider` prop)
- Modify: `src/app/sign-up/[[...sign-up]]/page.tsx` (remove the consent paragraph)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `CLERK_LOCALIZATION` from `@/lib/clerk-localization` — a plain object shaped `{ signUp: { legalConsent: { checkbox: { label__termsOfServiceAndPrivacyPolicy: string } } } }`. It is passed to `ClerkProvider`'s `localization` prop, whose type (`LocalizationResource`) is a deep-partial, so a plain untyped object literal satisfies it. **Do not** annotate it by importing from `@clerk/types` — that package is not a declared dependency. **Do not** add `as const` — the readonly widening it produces does not satisfy the prop.

- [ ] **Step 1: Write the failing test**

Create `src/lib/clerk-localization.test.ts`:

```ts
import { expect, test } from "vitest";
import { CLERK_LOCALIZATION } from "@/lib/clerk-localization";

const LABEL =
  CLERK_LOCALIZATION.signUp.legalConsent.checkbox.label__termsOfServiceAndPrivacyPolicy;

test("sign-up affirmation covers the user and their organization", () => {
  expect(LABEL).toContain("legally able to create this account");
  expect(LABEL).toContain("for myself and for my organization");
});

test("sign-up affirmation links both legal documents", () => {
  expect(LABEL).toContain("{{termsOfServiceLink}}");
  expect(LABEL).toContain("{{privacyPolicyLink}}");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/clerk-localization.test.ts`

Expected: FAIL — the module does not exist, so the import cannot resolve.

- [ ] **Step 3: Create the localization module**

Create `src/lib/clerk-localization.ts`:

```ts
// Clerk UI copy overrides.
//
// The sign-up affirmation lives here rather than inline in layout.tsx so it is a
// plain testable value — the wording is a compliance commitment from the
// 2026-07-27 review, not decoration. Clerk substitutes {{termsOfServiceLink}}
// and {{privacyPolicyLink}} with links to the URLs configured in the Clerk
// Dashboard, so the anchors must not be hardcoded here.
//
// The checkbox only renders once "Require express consent to legal documents" is
// enabled in the Clerk Dashboard — separately for the development and the
// production instance. Without that toggle this override is inert.
//
// Not type-annotated on purpose: ClerkProvider's `localization` prop is a
// deep-partial, and @clerk/types is not a declared dependency of this project.
export const CLERK_LOCALIZATION = {
  signUp: {
    legalConsent: {
      checkbox: {
        label__termsOfServiceAndPrivacyPolicy:
          "I confirm I am legally able to create this account for myself and for my " +
          "organization, and I agree to the {{termsOfServiceLink}} and {{privacyPolicyLink}}.",
      },
    },
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/clerk-localization.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into `ClerkProvider`**

In `src/app/layout.tsx`, add the import below the existing Clerk import (line 3):

```tsx
import { CLERK_LOCALIZATION } from "@/lib/clerk-localization";
```

Then change line 25 from `<ClerkProvider>` to:

```tsx
    <ClerkProvider localization={CLERK_LOCALIZATION}>
```

- [ ] **Step 6: Remove the redundant consent paragraph from sign-up**

Replace the entire contents of `src/app/sign-up/[[...sign-up]]/page.tsx` with:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignUp />
    </main>
  );
}
```

The `Link` and `LEGAL_LINKS` imports go with it. `LEGAL_LINKS` itself stays exported from `src/components/landing/landing-content.ts` — the landing footer still uses it.

- [ ] **Step 7: Verify nothing else depended on those imports**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean, full suite green. `src/components/landing/landing-content.test.ts` must still pass untouched — it asserts `LEGAL_LINKS`. If it fails, the previous step removed the export instead of just the usage; restore the export.

- [ ] **Step 8: Commit**

```bash
git add src/lib/clerk-localization.ts src/lib/clerk-localization.test.ts src/app/layout.tsx "src/app/sign-up/[[...sign-up]]/page.tsx"
git commit -m "feat(legal): required affirmation checkbox at sign-up

Enable Clerk's built-in legal consent and label it with the affirmation the
compliance review asked for — that the user is legally able to create the
account for themselves and for their organization. Clerk records
legalAcceptedAt per user. Replaces the passive consent line under the form.

Requires 'Require express consent to legal documents' to be enabled in the
Clerk Dashboard for both the development and production instances."
```

---

### Task 4: Full verification

**Files:** none modified — this task is the integration gate.

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: a verified branch, plus the launch-blocker list handed back to Chris.

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run`

Expected: PASS. The suite was 443 tests before this work; expect 443 + 14 new (8 privacy, 4 terms, 2 localization). Report the actual number — do not assume it.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: both clean, no warnings introduced.

- [ ] **Step 3: Production build**

Run: `npm run build`

Expected: succeeds. `/terms` and `/privacy` must still appear as static routes in the build output — they are listed in `src/lib/public-routes.ts` and must stay reachable signed-out.

- [ ] **Step 4: Check both pages in a real browser**

Run `npm run dev`, then visit `http://localhost:3000/terms` and `http://localhost:3000/privacy` **signed out**.

Confirm by eye:
- Every "On this page" anchor on `/privacy` scrolls to a real section — there are 9, and none may be dead. The removed `#providers` and `#security` anchors must be gone, and `#safeguards` must be present.
- No vendor names anywhere on `/privacy`.
- All three email addresses on `/terms` are clickable `mailto:` links.
- Both pages read "Last updated: July 27, 2026".

If localhost throws "enqueueModel is not a function" or similar RSC errors, that is a stale service worker from another project, not this change — clear site data for localhost:3000 and reload.

- [ ] **Step 5: Confirm the sign-up checkbox is inert until configured**

Visit `http://localhost:3000/sign-up`. Expect the Clerk form with **no** checkbox and **no** consent paragraph beneath it. This is correct and expected — the checkbox appears only after the Dashboard toggle. Note it in the report so it is not mistaken for a bug.

- [ ] **Step 6: Report the launch blockers**

Do not push and do not deploy. Hand back to Chris with these two items, neither of which is a code task:

1. **Create `billing@measuremycostume.com` and `privacy@measuremycostume.com`.** Both pages now promise a 30-day response at `privacy@`; an address that bounces is a self-inflicted policy violation.
2. **Enable Clerk legal consent in both instances** — development and production are configured separately:
   - Configure → Restrictions → Legal compliance → "Require express consent to legal documents"
   - Terms of Service URL: `https://www.measuremycostume.com/terms`
   - Privacy Policy URL: `https://www.measuremycostume.com/privacy`

   After enabling, re-check `/sign-up` and confirm the checkbox renders with the custom label and blocks submission until ticked.

Also restate, because it is easy to lose: **these drafts are not legal advice.** Naming CCPA and GDPR converts general language into specific statutory commitments. The pages needed lawyer review before this change and need it more now.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: Privacy nav/collect/performers/use/sharing/safeguards/retention/rights/cookies/changes → Task 1. Terms §1/§5/§7/§9/§13 and the date → Task 2. Layout localization, sign-up cleanup, and the Dashboard config → Task 3. Testing → Tasks 1–3, verified in Task 4. Launch blockers and risks → Task 4 Step 6.

**Deviations from the spec, deliberate.** The spec named `src/app/privacy/page.test.tsx` and `src/app/terms/page.test.tsx` as render tests. Rendering requires jsdom and `@testing-library/react`, neither of which this repo has, and adding them for two static pages is not justified. Replaced with one source-copy guard, `src/app/legal-pages.test.ts`, which asserts the same content. The spec also placed the Clerk `localization` object inline in `layout.tsx`; it moves to `src/lib/clerk-localization.ts` so the affirmation wording is testable. Both changes preserve the spec's intent and its assertion list.

**Placeholder scan.** No TBD, TODO, "handle edge cases", or "similar to Task N". Every code step contains complete, paste-ready content.

**Type consistency.** `copyOf` is defined once in Task 1 and reused by name in Task 2. `PRIVACY` and `TERMS` are the only module-level constants and are referenced consistently. `CLERK_LOCALIZATION` is exported in Task 3 Step 3 and consumed under that exact name in Step 5 and in its test.
