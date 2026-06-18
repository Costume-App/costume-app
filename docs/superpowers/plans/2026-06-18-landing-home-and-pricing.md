# Canonical `/` Home + Landing Pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` the canonical product home (logged-out → the Measure-My-Costume landing, logged-in → `/productions`), retire the A/B scaffolding, and add a pricing section to the landing.

**Architecture:** Task 1 flattens the landing to a single Measure-My-Costume variant, adds a pricing section, and deletes the `/preview/*` A/B routes (after which `LandingPage` is self-contained and unused — builds clean). Task 2 wires it up: `src/app/page.tsx` renders the landing, and `src/proxy.ts` drops the host-rewrite and branches `/` on auth.

**Tech Stack:** Next.js 16 (App Router, Clerk middleware in `proxy.ts`), TypeScript strict, Tailwind (Atelier tokens). No new deps, no migration.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-landing-home-and-pricing-design.md`.
- Single canonical landing — **remove** the `make-the-drama` variant, the `LandingSlug` A/B machinery, and the `/preview/*` routes.
- Pricing CTAs → `/sign-up` (logged-out visitors purchase in-app after sign-up).
- Contact/demo email = **`hello@measuremycostume.com`** (replacing `hello@makethedrama.com`); demo mailto subject = "Demo request — Measure My Costume".
- `/` behavior: logged-in → `redirect("/productions")` (org-less users cascade to onboarding via the existing `orgGate`); logged-out → render the landing.
- Pricing copy (kept in sync by eye with `src/lib/billing-plans.ts` PLANS): **Pay per production — $49.99 one-time, per production** (1 production, 3 makers included, +$10 per extra maker); **Unlimited — $99/year** (unlimited productions, unlimited makers), marked best value.
- No new unit tests (presentational + trivial middleware branch — consistent with the repo). Verify each task with `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors). Local commits only — no push.

---

### Task 1: Flatten the landing to one variant + add pricing

**Files:**
- Modify: `src/components/landing/landing-content.ts`
- Modify: `src/components/landing/LandingPage.tsx`
- Delete: `src/app/preview/measure-my-costume/page.tsx`, `src/app/preview/make-the-drama/page.tsx`

**Interfaces:**
- Produces: `LandingPage()` (no props); `LANDING` config + `PRICING_TIERS` + `CONTACT_EMAIL` from `@/components/landing/landing-content`.
- Removes: `VARIANTS`, `VariantConfig`, `LandingSlug` (no longer exported).

- [ ] **Step 1: Rewrite the variant config + add pricing in `landing-content.ts`**

In `src/components/landing/landing-content.ts`, **remove** the `LandingSlug` type, the `VariantConfig` interface, and the entire `VARIANTS` map. Keep `Feature`, `FeatureGroup`, and `FEATURES` exactly as-is. Replace the removed pieces with a single config, a pricing type + tiers, and the updated contact email:

```ts
export interface LandingConfig {
  brand: string;
  /** Display title split so the last word can take the curtain-red accent. */
  titleLead: string;
  titleAccent: string;
  tagline: string;
  eyebrow: string;
  groupOrder: FeatureGroup[];
}

export const LANDING: LandingConfig = {
  brand: "Measure My Costume",
  titleLead: "Measure My",
  titleAccent: "Costume",
  tagline: "Every costume, every cast member, every yard — in one place.",
  eyebrow: "The costume shop, organized",
  groupOrder: ["Costumes & Inventory", "Production", "Cost"],
};

export interface PricingTier {
  name: string;
  price: string;
  cadence: string;
  points: string[];
  highlight?: boolean;
}

// Marketing copy — keep in sync by eye with PLANS in src/lib/billing-plans.ts.
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

export const CONTACT_EMAIL = "hello@measuremycostume.com";
```

(Delete the old `export const CONTACT_EMAIL = "hello@makethedrama.com";` line — there must be exactly one `CONTACT_EMAIL`.)

- [ ] **Step 2: Update `LandingPage.tsx` — drop the slug, fix the subject, render the single config**

In `src/components/landing/LandingPage.tsx`:

Change the import block (top of file) from the `VARIANTS`/`LandingSlug` form to:

```ts
import Link from "next/link";
import {
  FEATURES,
  LANDING,
  PRICING_TIERS,
  CONTACT_EMAIL,
  type FeatureGroup,
} from "@/components/landing/landing-content";
```

Change the demo href constant:

```ts
const DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Demo request — Measure My Costume")}`;
```

Change the component signature + variant lookup from `export function LandingPage({ slug }: { slug: LandingSlug }) { const v = VARIANTS[slug]; const groups = v.groupOrder;` to:

```ts
export function LandingPage() {
  const v = LANDING;
  const groups = v.groupOrder;
```

(Everything that reads `v.brand`, `v.eyebrow`, `v.titleLead`, `v.titleAccent`, `v.tagline`, `groups` stays unchanged.)

- [ ] **Step 3: Add the pricing section to `LandingPage.tsx`**

Insert this `<section>` immediately AFTER the closing `</section>` of the features block (the one that ends right before `{/* Curtain call */}`) and BEFORE the `{/* Curtain call */}` comment:

```tsx
      {/* Pricing */}
      <section className="relative mx-auto max-w-5xl px-5 pb-20">
        <div className="mb-12 text-center">
          <p className="lbl">Pricing</p>
          <h2 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            Simple plans for every program
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {PRICING_TIERS.map((tier) => (
            <article
              key={tier.name}
              className={`surface flex flex-col p-6 ${tier.highlight ? "ring-2 ring-[var(--red)]" : ""}`}
            >
              {tier.highlight && (
                <span className="lbl mb-2 inline-block text-[var(--red)]">Best value</span>
              )}
              <h3 className="font-display text-xl font-semibold">{tier.name}</h3>
              <p className="mt-2">
                <span className="font-display text-3xl font-semibold">{tier.price}</span>{" "}
                <span className="text-sm muted">{tier.cadence}</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {tier.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-[var(--red)]">✦</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`mt-6 text-center ${tier.highlight ? "btn-primary" : "btn-ghost"}`}
              >
                Get started →
              </Link>
            </article>
          ))}
        </div>
      </section>
```

- [ ] **Step 4: Delete the A/B preview routes**

```bash
git rm src/app/preview/measure-my-costume/page.tsx src/app/preview/make-the-drama/page.tsx
```

(After this `src/app/preview/` is empty; `git rm` leaves no tracked files there.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: clean. (No file imports `VARIANTS`/`LandingSlug` anymore: `proxy.ts` only references the `/preview/*` paths as strings — fixed in Task 2 — and the preview pages are deleted. `LandingPage` is currently unused, which is fine.)

Run: `npm run build && npm run lint`
Expected: build succeeds; lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/landing-content.ts src/components/landing/LandingPage.tsx
git commit -m "feat(landing): single Measure-My-Costume variant + pricing section; drop A/B preview routes"
```

---

### Task 2: Make `/` the canonical home

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `LandingPage()` (no props) from Task 1.

- [ ] **Step 1: Render the landing at `/`**

Replace the entire contents of `src/app/page.tsx` with:

```tsx
import { LandingPage } from "@/components/landing/LandingPage";

// `/` is the canonical home. Middleware (proxy.ts) redirects logged-in users to
// /productions, so this page only renders for logged-out visitors.
export default function Home() {
  return <LandingPage />;
}
```

- [ ] **Step 2: Update `proxy.ts` — drop the host rewrite, branch `/` on auth**

Replace the entire contents of `src/proxy.ts` with:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { orgGate } from "@/lib/route-guard";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/billing/webhook"]);
const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Canonical home: logged-out visitors see the landing (the `/` page);
  // logged-in users go straight to the app (org-less users then cascade to
  // /onboarding via orgGate on /productions).
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(new URL("/productions", req.url));
    return;
  }

  if (isPublic(req)) return;

  // Require a signed-in user for everything else.
  await auth.protect();

  // Then require an active organization, routing org-less users to onboarding
  // instead of letting protected pages throw "No active organization".
  const { orgId } = await auth();
  const decision = orgGate({ isOnboarding: isOnboarding(req), orgId: orgId ?? null });
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
```

(This removes the `LANDING_BY_HOST` map + the host-lookup/rewrite block, and drops `/preview(.*)` from `isPublic`. The `/api/billing/webhook` public entry and the `orgGate` logic are preserved.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build && npm run lint`
Expected: tsc clean; build succeeds; lint 0 errors.

- [ ] **Step 4: Manual smoke (document in the report)**

With `npm run dev` (on a clean port, e.g. `-p 3001`):
- Logged-out → visit `/` → see the Measure-My-Costume landing including the **Pricing** section; "Get started" links point to `/sign-up`.
- Logged-in → visit `/` → land on `/productions`.
- `/preview/measure-my-costume` → 404 (route deleted).

(Note: this changes live behavior and requires a deploy to reach prod.)

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/proxy.ts
git commit -m "feat(landing): canonical / home — landing for logged-out, /productions for logged-in"
```

---

## Self-Review

**Spec coverage:**
- Canonical `/` (logged-out landing / logged-in → /productions) → Task 2 (page.tsx + proxy branch). ✓
- Drop A/B scaffolding (MTD variant, LandingSlug, /preview routes, host rewrite) → Task 1 (content flatten + route deletion) + Task 2 (proxy rewrite removal). ✓
- Pricing section → Task 1 (PRICING_TIERS + section, CTAs → /sign-up). ✓
- Contact email → hello@measuremycostume.com + fixed demo subject → Task 1. ✓
- No migration / no new deps → none added. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; the two delete + replace operations are explicit.

**Type consistency:** `LandingPage()` (no props) is produced in Task 1 and consumed in Task 2's `page.tsx`. `LANDING`/`PRICING_TIERS`/`CONTACT_EMAIL`/`FeatureGroup`/`FEATURES` are the only landing-content exports referenced by `LandingPage.tsx` after Task 1; `VARIANTS`/`LandingSlug` are removed and no longer referenced anywhere (preview pages deleted in the same task). `isPublic` no longer lists `/preview(.*)`; `/api/billing/webhook` retained.
