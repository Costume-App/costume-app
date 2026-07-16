# Terms of Service & Privacy Policy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public, themed `/terms` and `/privacy` pages to measuremycostume.com, linked from the landing footer and a consent line on the sign-up page.

**Architecture:** Two static server-component pages sharing a small `LegalShell` component (styled like `/guide`). The middleware's public-route patterns and the legal link hrefs/labels are extracted into tested data modules; the pages themselves are static JSX verified by typecheck and a curl pass against the dev server.

**Tech Stack:** Next.js 16 App Router, Clerk middleware (`proxy.ts`), Tailwind 4 utility classes + the app's `globals.css` theme classes (`surface`, `lbl`, `muted`, `link-muted`, `link-red`, `font-display`), Vitest (node environment, pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-07-15-terms-privacy-pages-design.md`

## Global Constraints

- **Next.js 16 has breaking changes** — if unsure about an App Router convention, check `node_modules/next/dist/docs/` first. Middleware lives in `src/proxy.ts` (NOT `middleware.ts`).
- Work on a feature branch `feat/terms-privacy` (create via the using-git-worktrees skill at execution start if isolating). Local commits only — **never push or deploy**; Chris green-lights pushes explicitly.
- Operator identity in the documents is **"Measure My Costume"** only (no legal entity). Contact: **hello@measuremycostume.com**. Governing law: **Washington State**. Last-updated date: **July 15, 2026**.
- **No hard-coded prices** anywhere in the legal copy — refer to "pricing shown on the site".
- No lawyer-review caveat on the public pages (that note lives in the handoff to Chris, not in the product).
- ESLint (`next/core-web-vitals`) rejects unescaped `'` and `"` in JSX text — use `&rsquo;`, `&ldquo;`, `&rdquo;` entities, exactly as `src/app/(app)/guide/page.tsx` does.
- Run tests with `npm test` (vitest run). Typecheck with `npx tsc --noEmit`. Lint with `npm run lint`.
- Suite baseline: all existing tests green before starting (443+ tests). Never commit with a red suite.

---

### Task 1: Public route patterns as tested data

The middleware (`src/proxy.ts`) currently inlines its public route list into `createRouteMatcher([...])`. Extract that list into a data module so the "legal pages are public" requirement is testable, then add `/terms` and `/privacy`.

**Files:**
- Create: `src/lib/public-routes.ts`
- Create: `src/lib/public-routes.test.ts`
- Modify: `src/proxy.ts:5` (the `isPublic` matcher)

**Interfaces:**
- Consumes: nothing.
- Produces: `PUBLIC_ROUTES: string[]` (Clerk `createRouteMatcher` patterns) exported from `@/lib/public-routes`. Task 6's verification relies on `/terms` and `/privacy` being present.

- [ ] **Step 1: Write the failing test**

Create `src/lib/public-routes.test.ts`:

```ts
import { expect, test } from "vitest";
import { PUBLIC_ROUTES } from "@/lib/public-routes";

test("legal pages are publicly reachable", () => {
  expect(PUBLIC_ROUTES).toContain("/terms");
  expect(PUBLIC_ROUTES).toContain("/privacy");
});

test("existing public routes are preserved", () => {
  for (const route of ["/sign-in(.*)", "/sign-up(.*)", "/get-started", "/api/billing/webhook"]) {
    expect(PUBLIC_ROUTES).toContain(route);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/public-routes.test.ts`
Expected: FAIL — cannot resolve `@/lib/public-routes`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/public-routes.ts`:

```ts
// Route patterns (Clerk createRouteMatcher syntax) reachable without signing in.
// `/` is handled separately in proxy.ts (logged-out visitors see the landing).
export const PUBLIC_ROUTES = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/get-started",
  "/api/billing/webhook",
  "/terms",
  "/privacy",
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/public-routes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the middleware to the data module**

In `src/proxy.ts`, replace:

```ts
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/get-started", "/api/billing/webhook"]);
```

with:

```ts
import { PUBLIC_ROUTES } from "@/lib/public-routes";

const isPublic = createRouteMatcher(PUBLIC_ROUTES);
```

(The `import` goes with the other imports at the top of the file; keep the existing `orgGate` import.)

- [ ] **Step 6: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/public-routes.ts src/lib/public-routes.test.ts src/proxy.ts
git commit -m "feat(legal): expose /terms and /privacy as public routes (tested data module)"
```

---

### Task 2: LEGAL_LINKS data in landing-content

Single source of truth for the two legal links, consumed by the landing footer (short labels) and the sign-up consent line (full document names).

**Files:**
- Modify: `src/components/landing/landing-content.ts` (append at end of file)
- Modify: `src/components/landing/landing-content.test.ts` (append test)

**Interfaces:**
- Consumes: nothing.
- Produces: `LEGAL_LINKS: LegalLink[]` and `interface LegalLink { href: string; label: string; fullLabel: string }` exported from `@/components/landing/landing-content`. Tasks 5 and 6 map over it.

- [ ] **Step 1: Write the failing test**

Append to `src/components/landing/landing-content.test.ts` (add `LEGAL_LINKS` to the existing import from `@/components/landing/landing-content`):

```ts
test("legal links point at the terms and privacy pages", () => {
  expect(LEGAL_LINKS.map((l) => l.href)).toEqual(["/terms", "/privacy"]);
  for (const l of LEGAL_LINKS) {
    expect(l.label.length).toBeGreaterThan(0);
    expect(l.fullLabel.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/landing/landing-content.test.ts`
Expected: FAIL — `LEGAL_LINKS` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/components/landing/landing-content.ts`:

```ts
export interface LegalLink {
  href: string;
  /** Short label for the landing footer row. */
  label: string;
  /** Full document name for consent sentences. */
  fullLabel: string;
}

export const LEGAL_LINKS: LegalLink[] = [
  { href: "/terms", label: "Terms", fullLabel: "Terms of Service" },
  { href: "/privacy", label: "Privacy", fullLabel: "Privacy Policy" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/landing/landing-content.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landing-content.ts src/components/landing/landing-content.test.ts
git commit -m "feat(legal): add LEGAL_LINKS to landing content"
```

---

### Task 3: Terms of Service page + shared LegalShell

Create the shared legal-page shell/typography component and the complete Terms page. Static JSX — no unit test (same stance as `/guide`); verified by typecheck now and curl in Task 6.

**Files:**
- Create: `src/components/legal/LegalPage.tsx`
- Create: `src/app/terms/page.tsx`

**Interfaces:**
- Consumes: theme classes from `globals.css` (no imports needed beyond React/Next).
- Produces: from `@/components/legal/LegalPage`: `LegalShell({ title, updated, intro, children })`, `Section({ id, title, children })`, `P({ children })`, `UL({ children })`, `LI({ children })`, `B({ children })` — all `React.ReactNode` children. Task 4 (privacy page) imports the same components.

- [ ] **Step 1: Create the shared shell**

Create `src/components/legal/LegalPage.tsx`:

```tsx
import Link from "next/link";

// Shared shell + typography for the public legal pages (/terms, /privacy).
// Mirrors the /guide page's look: Fraunces headings, muted body, surface cards.
export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/" className="link-muted text-sm">
        ← Home
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm muted">{intro}</p>
      <p className="mb-8 text-sm muted">Last updated: {updated}</p>
      <div className="space-y-10">{children}</div>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}
```

- [ ] **Step 2: Create the Terms page**

Create `src/app/terms/page.tsx`:

```tsx
import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Terms of Service" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="July 15, 2026"
      intro="The plain-English rules for using Measure My Costume."
    >
      <Section id="agreement" title="1. Agreeing to these terms">
        <P>
          Measure My Costume (&ldquo;the service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          costume- and production-planning tool for theater organizations, available at
          measuremycostume.com. By creating an account or using the service, you agree to these
          terms and to our <Link href="/privacy" className="link-red">Privacy Policy</Link>. If
          you are using the service on behalf of an organization, you are agreeing for that
          organization too.
        </P>
        <P>You must be at least 18 years old to create an account.</P>
      </Section>

      <Section id="service" title="2. The service">
        <P>
          Measure My Costume helps costume teams plan productions: manage roles and casts, record
          performer measurements, design and source costume pieces, track a house inventory, and
          estimate fabric and costs.
        </P>
      </Section>

      <Section id="accounts" title="3. Accounts and organizations">
        <P>
          Sign-in is handled by our authentication provider. Your work lives inside an{" "}
          <B>organization</B>; organization admins control who is a member and what settings
          apply. Keep your sign-in credentials secure — you are responsible for activity that
          happens under your account.
        </P>
      </Section>

      <Section id="content" title="4. Your content">
        <P>
          Your organization owns the content it puts into the service — productions, designs,
          measurements, photos, and notes. We claim no ownership of it. You grant us only the
          limited license we need to store, process, back up, and display that content in order
          to run the service for you.
        </P>
        <P>You are responsible for having the rights to any content you upload.</P>
      </Section>

      <Section id="performers" title="5. Performer information">
        <P>
          Much of what the service stores is information about performers — names, body
          measurements, and photos — entered by your organization. <B>Your organization is
          responsible for having permission to collect and store that information</B>, including
          consent from a parent or guardian for performers under 18. Do not enter information
          about a performer if you do not have that permission.
        </P>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <UL>
          <LI>Use the service only for lawful purposes.</LI>
          <LI>Do not upload content that is abusive, infringing, or harmful.</LI>
          <LI>Do not probe, disrupt, scrape, or reverse engineer the service.</LI>
          <LI>Do not resell the service or share accounts outside your organization.</LI>
        </UL>
      </Section>

      <Section id="payments" title="7. Payments">
        <P>
          Paid plans are billed by our payment processor, Stripe, at the pricing shown on the
          site — a one-time purchase per production or an annual subscription. You can cancel a
          subscription at any time; it stays active until the end of the period you paid for.
          Fees are nonrefundable except where the law requires otherwise. If prices change, we
          will let you know before your next renewal.
        </P>
      </Section>

      <Section id="ai" title="8. Automatic estimates">
        <P>
          Fabric-yardage estimates are generated automatically. They are suggestions to help you
          plan, not guarantees — double-check quantities before purchasing fabric. We are not
          responsible for purchasing decisions made from an estimate.
        </P>
      </Section>

      <Section id="ending" title="9. Ending your use">
        <P>
          You can stop using the service at any time, and you can ask us to delete your
          organization and its data by emailing{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          . We may suspend or close accounts that violate these terms, with notice where
          practical.
        </P>
      </Section>

      <Section id="disclaimers" title="10. Disclaimers and limitation of liability">
        <P>
          The service is provided <B>as is</B> and <B>as available</B>, without warranties of any
          kind. To the fullest extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages, and our total liability for any claim is limited
          to the amount your organization paid us in the 12 months before the claim arose.
        </P>
      </Section>

      <Section id="changes" title="11. Changes to these terms">
        <P>
          We may update these terms from time to time. We will post the new version here with an
          updated date, and for material changes we will notify you by email or in the app.
          Continuing to use the service after a change means you accept the new terms.
        </P>
      </Section>

      <Section id="law" title="12. Governing law">
        <P>
          These terms are governed by the laws of the State of Washington, USA, without regard to
          its conflict-of-law rules.
        </P>
      </Section>

      <Section id="contact" title="13. Contact">
        <P>
          Questions about these terms? Email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          .
        </P>
      </Section>

      <p className="border-t border-[var(--field-line)] pt-4 text-sm muted">
        See also our <Link href="/privacy" className="link-red">Privacy Policy</Link>.
      </p>
    </LegalShell>
  );
}
```

- [ ] **Step 3: Typecheck, lint, and full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors (watch for unescaped-entity complaints), tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/legal/LegalPage.tsx src/app/terms/page.tsx
git commit -m "feat(legal): public Terms of Service page + shared LegalShell"
```

---

### Task 4: Privacy Policy page

The complete Privacy page, with an "On this page" TOC card like `/guide`.

**Files:**
- Create: `src/app/privacy/page.tsx`

**Interfaces:**
- Consumes: `LegalShell`, `Section`, `P`, `UL`, `LI`, `B` from `@/components/legal/LegalPage` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Create the Privacy page**

Create `src/app/privacy/page.tsx`:

```tsx
import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy Policy" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="July 15, 2026"
      intro="What Measure My Costume collects, why, and how it is handled."
    >
      <nav className="surface p-4 text-sm">
        <span className="lbl block">On this page</span>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><a href="#collect" className="link-muted">What we collect</a></li>
          <li><a href="#performers" className="link-muted">Performers &amp; minors</a></li>
          <li><a href="#use" className="link-muted">How we use information</a></li>
          <li><a href="#providers" className="link-muted">Service providers</a></li>
          <li><a href="#sharing" className="link-muted">Sharing</a></li>
          <li><a href="#security" className="link-muted">Security</a></li>
          <li><a href="#retention" className="link-muted">Retention &amp; deletion</a></li>
          <li><a href="#rights" className="link-muted">Your rights</a></li>
          <li><a href="#cookies" className="link-muted">Cookies</a></li>
          <li><a href="#changes" className="link-muted">Changes &amp; contact</a></li>
        </ul>
      </nav>

      <Section id="collect" title="What we collect">
        <UL>
          <LI>
            <B>Account information</B> — your name and email address, handled by our sign-in
            provider.
          </LI>
          <LI>
            <B>Organization content</B> — what your team enters to plan productions: shows,
            roles, performer names, measurements, costume designs, photos, notes, and fabric and
            cost details.
          </LI>
          <LI>
            <B>Billing information</B> — payments are handled by Stripe. We never see or store
            full card numbers.
          </LI>
          <LI>
            <B>Feedback</B> — anything you send us through the in-app feedback form or by email.
          </LI>
          <LI>
            <B>Technical basics</B> — sign-in session cookies and standard server logs that keep
            the service working and secure.
          </LI>
        </UL>
      </Section>

      <Section id="performers" title="Performers and minors">
        <P>
          Performer information — names, measurements, and photos — is entered by your
          organization, and your organization is responsible for having consent to store it,
          including from a parent or guardian for performers under 18. We process that
          information only to run the service for your organization. It is never used for
          advertising.
        </P>
        <P>
          Accounts are for adults. We do not knowingly let children under 13 create accounts,
          and we will delete any we discover.
        </P>
      </Section>

      <Section id="use" title="How we use information">
        <UL>
          <LI>To provide and operate the service for your organization.</LI>
          <LI>
            To calculate fabric estimates — descriptions of costume pieces are sent to our AI
            provider to produce the estimate.
          </LI>
          <LI>
            To send service email, such as invitations, requests to join an organization, and
            feedback replies.
          </LI>
          <LI>To respond to support requests and keep the service secure.</LI>
        </UL>
        <P>We do not sell personal information, and we show no advertising.</P>
      </Section>

      <Section id="providers" title="Service providers">
        <P>These companies process data for us, each receiving only what it needs:</P>
        <UL>
          <LI><B>Clerk</B> — sign-in and account management.</LI>
          <LI><B>Supabase</B> — database and photo storage.</LI>
          <LI><B>Stripe</B> — payments and billing.</LI>
          <LI><B>Anthropic</B> — AI fabric estimates.</LI>
          <LI><B>Resend</B> — email delivery.</LI>
          <LI><B>Vercel</B> — hosting.</LI>
        </UL>
      </Section>

      <Section id="sharing" title="Sharing">
        <P>
          We do not sell or rent your information. Beyond the providers above, we share data only
          if the law requires it.
        </P>
        <P>
          If your organization shares a production with another organization using a share link,
          only the design layer is copied — roles, costume designs, notes, and design photos.{" "}
          <B>Performer names and measurements are never included.</B>
        </P>
      </Section>

      <Section id="security" title="Security">
        <UL>
          <LI>All traffic is encrypted in transit (HTTPS).</LI>
          <LI>Your data is only visible to members of your organization.</LI>
          <LI>Photo links are time-limited signed URLs, not public addresses.</LI>
          <LI>Payment details go directly to Stripe and never touch our servers.</LI>
        </UL>
      </Section>

      <Section id="retention" title="Retention and deletion">
        <P>
          We keep your organization&rsquo;s data while the organization is active. To delete your
          organization and its data, email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>{" "}
          and we will remove it within a reasonable period.
        </P>
      </Section>

      <Section id="rights" title="Your rights">
        <P>
          You can view and update most information directly in the app. For access, correction,
          export, or deletion requests, email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          .
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

- [ ] **Step 2: Typecheck, lint, and full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/privacy/page.tsx
git commit -m "feat(legal): public Privacy Policy page"
```

---

### Task 5: Landing footer links

Map `LEGAL_LINKS` into the landing footer next to Log in / Get started / Contact, and let the row wrap on narrow screens.

**Files:**
- Modify: `src/components/landing/LandingPage.tsx` (import block at top; footer at lines ~207–220)

**Interfaces:**
- Consumes: `LEGAL_LINKS` from `@/components/landing/landing-content` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Add LEGAL_LINKS to the existing import**

In `src/components/landing/LandingPage.tsx`, extend the existing import:

```tsx
import {
  FEATURES,
  LANDING,
  PRICING_TIERS,
  CONTACT_EMAIL,
  LEGAL_LINKS,
  type FeatureGroup,
} from "@/components/landing/landing-content";
```

- [ ] **Step 2: Add the links to the footer**

In the footer, replace:

```tsx
          <div className="flex items-center gap-5 text-sm">
            <Link href="/sign-in" className="link-muted">Log in</Link>
            <Link href="/sign-up" className="link-muted">Get started</Link>
            <a href={DEMO_HREF} className="link-muted">Contact</a>
          </div>
```

with:

```tsx
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
            <Link href="/sign-in" className="link-muted">Log in</Link>
            <Link href="/sign-up" className="link-muted">Get started</Link>
            <a href={DEMO_HREF} className="link-muted">Contact</a>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="link-muted">
                {l.label}
              </Link>
            ))}
          </div>
```

- [ ] **Step 3: Typecheck, lint, and full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/LandingPage.tsx
git commit -m "feat(legal): Terms and Privacy links in the landing footer"
```

---

### Task 6: Sign-up consent line + end-to-end verification

Add the consent line under the Clerk sign-up card, then verify the whole feature against a running dev server.

**Files:**
- Modify: `src/app/sign-up/[[...sign-up]]/page.tsx` (entire file shown below)

**Interfaces:**
- Consumes: `LEGAL_LINKS` from `@/components/landing/landing-content` (Task 2); public routes from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the sign-up page**

Replace the full contents of `src/app/sign-up/[[...sign-up]]/page.tsx` with:

```tsx
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { LEGAL_LINKS } from "@/components/landing/landing-content";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignUp />
      <p className="max-w-xs text-center text-xs muted">
        By creating an account you agree to the{" "}
        {LEGAL_LINKS.map((l, i) => (
          <span key={l.href}>
            {i > 0 && <> and </>}
            <Link href={l.href} className="link-red">
              {l.fullLabel}
            </Link>
          </span>
        ))}
        .
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck, lint, and full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 3: Verify against the dev server (logged out)**

Start the dev server on a spare port so it cannot clash with anything running:

```bash
npm run dev -- --port 3001
```

Then, in another shell (curl sends no Clerk cookies, so this exercises the logged-out path through the middleware):

```bash
curl -s http://localhost:3001/terms | grep -o "Terms of Service" | head -1
curl -s http://localhost:3001/terms | grep -o "State of Washington" | head -1
curl -s http://localhost:3001/privacy | grep -o "Privacy Policy" | head -1
curl -s http://localhost:3001/privacy | grep -o "Anthropic" | head -1
curl -s http://localhost:3001/ | grep -o 'href="/terms"' | head -1
curl -s http://localhost:3001/ | grep -o 'href="/privacy"' | head -1
curl -s http://localhost:3001/sign-up | grep -o "By creating an account" | head -1
```

Expected: every command prints its match (non-empty). If `/terms` or `/privacy` returns a redirect to sign-in instead, Task 1's middleware wiring is wrong — stop and fix before committing.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add "src/app/sign-up/[[...sign-up]]/page.tsx"
git commit -m "feat(legal): consent line on sign-up linking Terms and Privacy"
```

---

## Completion

After all tasks: run `npm test && npx tsc --noEmit && npm run lint` one final time, then use the superpowers:finishing-a-development-branch skill (merge to `main` locally — **no push** until Chris green-lights). Remind Chris in the handoff: the documents are plain-language drafts and should get a lawyer&rsquo;s review before being relied on in a dispute.
