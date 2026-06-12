# Landing page (makethedrama.com) — design

**Date:** 2026-06-12
**Status:** Approved for build (A/B variants)
**Domain:** makethedrama.com (Vercel/DNS setup is a separate ops step)

## Goal

A public marketing landing page for the app, built in **two brand variants** to A/B
which positioning lands better, then promote the winner to the site root.

## Decisions (from brainstorming)

1. **Two variants**, same feature set + Atelier look, differing in name / hero framing /
   leading angle:
   - **Make the Drama** — broad, energetic; leads on running the whole production.
   - **Measure My Costume** — costume-craft focused; leads on costumes/fabric/inventory.
2. **CTAs**: `Get started` → `/sign-up` (Clerk, exists); `Request a demo` → `mailto:` a
   contact address (placeholder `hello@makethedrama.com` — Chris confirms); `Log in` →
   `/sign-in`.
3. **Hosting, non-disruptive**: build as public preview routes
   `/preview/make-the-drama` and `/preview/measure-my-costume`. The live root `/` keeps
   its current redirect-into-app behavior until a winner is chosen; **then** `/` shows the
   winning landing for logged-out visitors and redirects logged-in users to `/productions`.
4. **Visual**: the app's brand — muslin `#f4ecdd` bg, curtain-red `#8c2b22` accents,
   Fraunces display + Hanken body — warm, theatrical, premium; tasteful curtain/spotlight
   CSS motifs; no stock photos for v1 (real app screenshots can be added later).

## Page structure (shared by both variants)

1. **Hero** — brand name (Fraunces), one-line tagline, `[Get started]` + `[Request a demo]`.
2. **Feature grid** — the capabilities below as cards (icon + headline + one line), grouped
   **Production · Costumes & Inventory · Cost**. Order/emphasis tuned per variant.
3. **Closing CTA band** — "Ready for your next production?" + `[Get started]`.
4. **Footer** — brand line, `[Log in]`, contact.

## Feature copy (polished from the provided headlines)

- **All-in-one** — Every production detail in one place.
- **Auto roles** — Auto-build the cast list for popular shows.
- **Character boards** — Pin reference photos, ideas, and notes to every role.
- **Measurements** — Capture each cast member's measurements.
- **Sourcing** — Decide each piece: make it, buy it, or pull it from inventory.
- **Piece inspiration** — Collect photos and ideas for every costume piece.
- **House inventory** — Track your inventory with photos and storage locations per piece.
- **AI fabric estimate** — Let AI calculate the fabric to bring every costume to life.
- **Cost estimate** — See your production's whole estimated cost at a glance.

(Hero taglines:
 - *Make the Drama* — "Your all-in-one play production management suite."
 - *Measure My Costume* — "Every costume, every cast member, every yard — in one place.")

## Architecture

- `src/app/preview/make-the-drama/page.tsx` and `src/app/preview/measure-my-costume/page.tsx`
  — public server components (no auth), each rendering a shared `LandingPage` component
  with variant-specific props (name, tagline, feature ordering, accent emphasis).
- `src/components/landing/LandingPage.tsx` (+ small subcomponents: `LandingHero`,
  `FeatureGrid`, `LandingFooter`) — the reusable marketing layout, themed with the existing
  globals.css tokens. Keep marketing components isolated under `components/landing/`.
- No new data, routes-with-auth, or schema. `Request a demo` is a `mailto:` link (no
  backend) for v1.

## Out of scope (v1)

- Pricing page/section (per-school yearly license — "request a demo for pricing" only).
- Real contact form (needs email infra — deferred with the email-reminders feature).
- App screenshots / stock imagery.
- The `makethedrama.com` DNS + Vercel domain attachment (ops step Chris does).
- Promoting the winner to `/` (a quick follow-up once the variant is chosen).

## Testing

Primarily visual — built and reviewed live in the browser; verify `tsc` + `lint` + `build`.
No unit tests (static marketing content). The pages are public (no auth) and must render
for logged-out visitors.
