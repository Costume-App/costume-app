# Resume Checkout After Signup — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorm).

## Goal

When a logged-out visitor clicks a plan on the landing pricing section, remember that choice through sign-up + org creation, and **resume checkout automatically** once they have an org (checkout is org-scoped, so it can't run until then). Today the landing pricing cards link to `/sign-up` and the plan choice is lost.

## Decisions (from brainstorming)

- **Straight to Stripe Checkout** after account + org setup (no intermediate in-app confirm page).
- **Covers both** brand-new signups (sign-up → onboarding → org) **and** existing sign-ins — so the resume lives in **middleware** (fires once the user has an org), not just an onboarding redirect.
- Intent carried in a **short-lived `checkout_intent` cookie** (robust across Clerk's redirect chain), one-shot.
- Reuse the shipped `POST /api/billing/checkout` logic via a shared helper. No change to the checkout/webhook contract.

## Architecture

### 1. Intent cookie
`checkout_intent` = `"unlock"` | `"unlimited"`. `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, `maxAge: 3600` (1h). Set by `/get-started`, read+cleared by `/billing/resume`.

### 2. `GET /get-started` (public route handler) — `src/app/get-started/route.ts`
- Read `?plan`. If it is `"unlock"` or `"unlimited"`, build a redirect to `/sign-up` and set the `checkout_intent` cookie on that response. Otherwise redirect to `/sign-up` with no cookie.
- Added to the `isPublic` matcher in `proxy.ts` (landing visitors are logged-out).

### 3. Landing pricing cards — `src/components/landing/landing-content.ts` + `LandingPage.tsx`
- Add `checkoutType: "unlock" | "unlimited"` to each `PRICING_TIERS` entry (perProduction → `unlock`, Unlimited → `unlimited`).
- In `LandingPage`, the pricing-card CTA links to `` `/get-started?plan=${tier.checkoutType}` `` instead of `/sign-up`. The hero + footer generic "Get started" links stay `/sign-up` (no plan intent).

### 4. Middleware resume trigger — `src/proxy.ts`
After the existing `orgGate` allows a request (the user is signed in **and** has an `orgId`), add: if `req.cookies.get("checkout_intent")` is present **and** `!req.nextUrl.pathname.startsWith("/billing")`, redirect to `/billing/resume`. Placement: after the `orgGate` redirect check, before falling through to `return`. The `/billing` exclusion prevents a loop (the resume route and the Stripe return page live under `/billing`).
- New users: sign-up → onboarding creates org → `/productions` → trigger.
- Existing users: sign-in → `/productions` → trigger.
- Org-less users never trigger (orgGate sends them to `/onboarding` first; the cookie waits).

### 5. `GET /billing/resume` (route handler) — `src/app/billing/resume/route.ts`
- `getAuthContext()` → `orgId` (it's behind auth + org-gate, so an org exists).
- Read `checkout_intent`; **clear it on the response** regardless of outcome (one-shot → no loop).
- If the plan is missing/invalid OR `!isBillingConfigured()` → redirect `/productions` (cookie cleared).
- Else `url = await createCheckoutSession({ orgId, type: plan, origin })`; redirect to `url` (cookie cleared). On any error → redirect `/productions`.
- A route handler is used (not a page) because cookies can only be mutated in route handlers/server actions/middleware, not during a server-component render.

### 6. Shared `createCheckoutSession` — `src/lib/data/stripe-billing.ts`
Extract the session-building logic currently inline in `POST /api/billing/checkout`:
```ts
export async function createCheckoutSession(input: {
  orgId: string;
  type: CheckoutType;          // "unlock" | "seat" | "unlimited"
  productionId?: string;
  origin: string;
}): Promise<string>            // returns session.url
```
It calls `getOrCreateStripeCustomer(orgId)` and `getStripe().checkout.sessions.create(...)` with the same params the route builds today (mode payment/subscription, line item from `PRICE_IDS[type]`, metadata `{orgId, type, productionId?}`, `subscription_data.metadata.orgId` for unlimited, success/cancel URLs from `origin`). `POST /api/billing/checkout` is refactored to call it (after its existing auth/validation/`assertProductionInOrg`/503 checks). `/billing/resume` calls it with `type = plan`, `origin = new URL(request.url).origin`.

## Data flow

1. Landing → click "Unlimited" card → `GET /get-started?plan=unlimited` → sets cookie → `/sign-up`.
2. User signs up (or signs in) → Clerk → middleware → org-less → `/onboarding` → creates org → `/productions`.
3. `/productions` request → middleware: has org + `checkout_intent` cookie + not under `/billing` → redirect `/billing/resume`.
4. `/billing/resume` → clears cookie, creates the Stripe session, redirects to Stripe payment.
5. Pay → `/billing/return` (existing verify-on-return) → `/productions`, entitlement granted. Cancel → `/productions`.

## Edge cases

- **Abandon before finishing:** cookie expires in 1h; no effect.
- **Billing unconfigured / Stripe error:** `/billing/resume` clears the cookie and lands them in `/productions` (no dead-end, no loop).
- **No loop:** cookie cleared one-shot in `/billing/resume`; the `/billing` path exclusion in middleware keeps `/billing/return` and `/billing/resume` from re-triggering.
- **Tampered `?plan`:** irrelevant — `/get-started` validates before setting the cookie, and checkout is org-scoped via `getAuthContext`; worst case is starting a checkout the user could start anyway from the billing tab.
- **Existing user with an org clicks a landing plan:** the landing only renders for logged-out users (middleware redirects logged-in `/`→`/productions`), so they go through `/get-started` → `/sign-up` page → "sign in instead" → after sign-in the cookie triggers the resume.

## Testing (Vitest)

- `createCheckoutSession`: builds the correct session params per `type` (mode, price, metadata, subscription_data for unlimited, success/cancel URLs) and returns `session.url`; reused by the existing checkout-route tests (which should still pass after the refactor).
- `GET /get-started`: valid `plan` → 307 to `/sign-up` with the `checkout_intent` cookie set; invalid/missing → `/sign-up`, no cookie.
- `GET /billing/resume`: no cookie → redirect `/productions`, cookie cleared; valid plan + `isBillingConfigured` → calls `createCheckoutSession`, redirects to its URL, clears cookie; `!isBillingConfigured` → `/productions`, no session created.
- Middleware trigger + landing-card links: verified via `npm run build` + manual click-through (no middleware/RSC-page tests in the repo).

## Out of scope

Changes to the checkout/webhook/return flow itself; an in-app "confirm your plan" page (we go straight to Stripe); carrying a specific `productionId` from the landing (landing only offers org-level unlock/unlimited, not a seat for a specific production); persisting intent server-side (cookie is sufficient and one-shot).
