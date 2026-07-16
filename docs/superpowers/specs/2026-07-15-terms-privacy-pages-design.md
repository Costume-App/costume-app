# Terms of Service & Privacy Policy Pages — Design

**Date:** 2026-07-15
**Status:** Approved by Chris (brainstorming session)

## Goal

Nada wants a Terms of Service link and a Privacy Policy on the measuremycostume.com
site. Add two public, themed, static legal pages and link them from the landing
footer and the sign-up page.

## Decisions made

- **Content source:** Claude drafts both documents in plain English, tailored to the
  app. They are a starting point; lawyer review is recommended before relying on them
  in a dispute (this caveat lives in the handoff to Chris, NOT on the public pages).
- **Operator identity:** the documents refer to the service as "Measure My Costume"
  only — no legal entity name yet. Contact: hello@measuremycostume.com.
- **Governing law:** Washington State (Terms only).
- **Placement:** landing-page footer links + consent line on /sign-up. No in-app
  footer (deliberately out of scope).
- **Approach:** static themed JSX pages in the style of `/guide` (Approach A).
  Rejected: markdown-driven pages (new dependency for two rarely-edited documents)
  and a single combined `/legal` page (nonstandard URLs).

## Implementation

### New routes

- `src/app/terms/page.tsx` — Terms of Service.
- `src/app/privacy/page.tsx` — Privacy Policy.

Both are top-level routes **outside** the `(app)` group (no app nav), static server
components with `export const metadata = { title: ... }`. Visual pattern copied from
`src/app/(app)/guide/page.tsx`:

- `<main className="mx-auto max-w-2xl p-6">`
- "← Home" `link-muted` link back to `/`
- Fraunces display `<h1>`, `muted` intro line
- "Last updated: July 15, 2026" line
- Privacy page gets an "On this page" TOC in a `surface` card (like /guide);
  the Terms page is short enough to skip the TOC.
- Each page cross-links to the other at the bottom.

### Middleware

`src/proxy.ts`: add `"/terms"` and `"/privacy"` to the `isPublic` route matcher so
logged-out visitors can read them.

### Landing footer

`src/components/landing/LandingPage.tsx` footer link row (currently Log in /
Get started / Contact): append `Terms` → `/terms` and `Privacy` → `/privacy`,
both `link-muted`, same styling as the existing links.

### Sign-up consent line

`src/app/sign-up/[[...sign-up]]/page.tsx`: wrap the Clerk `<SignUp />` in a column
and add a small muted line beneath the card:

> By creating an account you agree to the [Terms of Service](/terms) and
> [Privacy Policy](/privacy).

## Document content

Plain-English voice matching the site. Effective/last-updated date: July 15, 2026.
**No hard-coded prices** — the Terms reference "pricing shown on the site".

### Terms of Service (13 short sections, no TOC)

1. Acceptance & eligibility — agreeing by creating an account; account holders 18+.
2. The service — costume & production planning for theater organizations.
3. Accounts & organizations — Clerk sign-in; org admins control membership; keep
   credentials safe.
4. Your content — organizations own their data (productions, measurements, photos,
   notes); we take only the license needed to store, process, and display it to run
   the service.
5. **Performer data responsibility** (key clause) — the organization is responsible
   for having permission to enter performers' measurements and photos, including
   parent/guardian consent for minors.
6. Acceptable use — lawful use only; no abuse, scraping, or reverse engineering.
7. Payments — processed by Stripe; one-time production purchase and annual
   subscription per pricing shown on the site; subscriptions cancelable anytime and
   stay active until the end of the paid period; fees nonrefundable except as
   required by law.
8. AI features — fabric estimates are automated suggestions; verify before
   purchasing fabric; no warranty on estimates.
9. Termination — user can stop/delete; we can suspend for violations.
10. Disclaimers & limitation of liability — service provided as-is; liability capped
    at fees paid in the prior 12 months.
11. Changes to terms — updates posted; material changes notified.
12. Governing law — Washington State.
13. Contact — hello@measuremycostume.com.

### Privacy Policy (~10 sections, with TOC)

1. What we collect — account info (name, email via Clerk); organization content
   (productions, roles, performer names, measurements, photos, notes); billing via
   Stripe (we never see full card numbers); feedback submissions; auth/session
   cookies.
2. **Performers & minors** — performer data is entered by your organization, which
   is responsible for consent (including parental/guardian consent for minors); we
   process it only to run the service, never for advertising; no accounts for
   children under 13.
3. How we use data — provide the service; AI fabric estimates send garment
   descriptions to our AI provider; email notifications; support.
4. Service providers (named) — Clerk (sign-in), Supabase (database & photo storage),
   Stripe (payments), Anthropic (AI estimates), Resend (email), Vercel (hosting).
5. Sharing — we don't sell data; only the providers above and legal requirements;
   the production-sharing feature copies designs only, never performers or
   measurements.
6. Security — encryption in transit; access scoped to your organization;
   time-limited signed photo URLs.
7. Retention & deletion — kept while the account/org is active; deletion on request.
8. Your rights — access, correct, delete via the app or hello@measuremycostume.com.
9. Cookies — authentication/session only; no advertising trackers.
10. Changes & contact.

## Testing (Vitest, TDD per repo convention)

- Extend route matcher coverage: `/terms` and `/privacy` are public (reachable
  logged-out) — test alongside the existing route-guard tests.
- Render tests: landing footer contains links to `/terms` and `/privacy`; sign-up
  page contains the consent line with both links.
- The legal page content itself is static JSX and is not unit-tested (same stance
  as `/guide`).

## Out of scope

- In-app footer for signed-in users.
- Clerk dashboard "legal consent" checkbox configuration (the consent line on the
  sign-up page covers this; can be added later without code).
- Cookie banner / GDPR consent tooling (no ad trackers exist).
- Deployment — local commits only until Chris green-lights a push.
