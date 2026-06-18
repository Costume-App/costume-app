# Canonical `/` Home + Landing Pricing — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorm).

## Goal

Make `measuremycostume.com/` the real product home and retire the A/B landing scaffolding now that "Measure My Costume" is the chosen name:

1. **Canonical `/`** — logged-out visitors see the Measure-My-Costume landing; logged-in users go straight to the app.
2. **Drop the A/B scaffolding** — remove the Make-the-Drama variant, the `/preview/*` routes, and the host-based rewrite. One landing, served at `/`.
3. **Add a pricing section** to the landing showing the two plans, with "Get started" → `/sign-up`.

This replaces the current setup where `/` only shows the landing via a `LANDING_BY_HOST` rewrite (so logged-in users at `/` also see the landing) and `src/app/page.tsx` just `redirect("/productions")`.

## Decisions (from brainstorming)

- **Drop the A/B scaffolding entirely** (single canonical landing). Make-the-Drama is retired as the app name.
- **Pricing CTAs → `/sign-up`** (logged-out visitors can't run Stripe checkout — it needs an authenticated org; purchase happens in-app after sign-up via Phase-2 checkout / the billing tab).
- **Contact/demo email → `hello@measuremycostume.com`** (replacing the `hello@makethedrama.com` placeholder).
- Needs a **deploy** to take effect (live behavior change).

## Architecture / changes

### 1. Routing — `src/proxy.ts`
- Delete `LANDING_BY_HOST` and the root-rewrite block.
- Remove `/preview(.*)` from the `isPublic` matcher (those routes are deleted). `isPublic` becomes `["/sign-in(.*)", "/sign-up(.*)", "/api/billing/webhook"]`.
- Add an explicit `/` branch at the top of the middleware, before `isPublic`/`auth.protect`:

```ts
if (req.nextUrl.pathname === "/") {
  const { userId } = await auth();
  if (userId) return NextResponse.redirect(new URL("/productions", req.url));
  return; // logged-out → render the landing at /
}
```

A logged-in user with no org redirects to `/productions`, where the existing `orgGate` forwards them to `/onboarding` — no special handling needed.

### 2. Root page — `src/app/page.tsx`
Replace `redirect("/productions")` with rendering the landing:

```tsx
import { LandingPage } from "@/components/landing/LandingPage";
export default function Home() {
  return <LandingPage />;
}
```

Middleware redirects logged-in users away, so this page only ever renders for logged-out visitors.

### 3. Simplify the landing (remove the A/B)
- **`src/components/landing/landing-content.ts`:** remove the `make-the-drama` `VARIANTS` entry, the `LandingSlug` type, and the `VARIANTS` map / per-slug `groupOrder` machinery. Keep `FEATURES`. Export a single Measure-My-Costume config (brand, `titleLead`/`titleAccent`, tagline, eyebrow, feature group order `["Costumes & Inventory", "Production", "Cost"]`). Change `CONTACT_EMAIL` to `hello@measuremycostume.com`.
- **`src/components/landing/LandingPage.tsx`:** drop the `slug` prop and `VARIANTS[slug]` lookup — render the single config directly. Fix the demo-request mailto subject (currently hardcodes "Make the Drama") to "Measure My Costume". Insert the pricing section (below).
- **Delete** `src/app/preview/measure-my-costume/page.tsx` and `src/app/preview/make-the-drama/page.tsx` (and the now-empty `src/app/preview/` dir).

### 4. Pricing section
Add a `PRICING_TIERS` constant to `landing-content.ts` and render a new `<section>` in `LandingPage` between Features and the final CTA:

```ts
export interface PricingTier {
  name: string;
  price: string;
  cadence: string;
  points: string[];
  highlight?: boolean;
}
export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Pay per production",
    price: "$49.99",
    cadence: "one-time, per production",
    points: ["1 production", "3 makers included", "+$10 per extra maker"],
  },
  {
    name: "Unlimited",
    price: "$99",
    cadence: "per year",
    points: ["Unlimited productions", "Unlimited makers", "Best for ongoing programs"],
    highlight: true,
  },
];
```

- Two cards, Atelier styling consistent with the rest of the page (reuse `surface`, `font-display`, `--red` accent for the highlighted tier).
- Each card's CTA: **Get started** → `Link href="/sign-up"`.
- Prices kept in sync (by eye) with `src/lib/billing-plans.ts` `PLANS` / the Stripe prices; this is marketing copy, not a live read.

### 5. Files summary
- Modify: `src/proxy.ts`, `src/app/page.tsx`, `src/components/landing/landing-content.ts`, `src/components/landing/LandingPage.tsx`.
- Delete: `src/app/preview/measure-my-costume/page.tsx`, `src/app/preview/make-the-drama/page.tsx`.

## Edge cases

- **makethedrama.com** (Chris owns it; not pointed at the app as the primary): with the host rewrite gone, if it ever resolves to this deployment its `/` behaves like the canonical home (landing for logged-out). No special handling — it's unused.
- **Logged-out deep links** (e.g. `/productions`) still hit `auth.protect` → sign-in, unchanged.
- **`/preview/*`** now 404 (routes deleted) — acceptable; they were internal A/B preview URLs, not linked anywhere public.

## Testing

The landing is presentational and the repo has no landing/RSC-page tests; the `/`-branch logic in middleware is a trivial `userId ? redirect : allow`. Verify with `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors), and a manual logged-out (see landing + pricing) / logged-in (land on `/productions`) click-through. No new unit tests — consistent with the repo's approach for these layers.

## Out of scope

Visual redesign of the landing, real read of live Stripe prices into the page, a separate `/pricing` route, and removing the `makethedrama.com` domain from DNS/Vercel (operational, Chris's side).
