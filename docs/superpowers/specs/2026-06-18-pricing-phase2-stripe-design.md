# Pricing Phase 2 — Stripe Checkout & Webhooks — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorm). Builds on Phase 1 ([[roadmap-pricing]] / `docs/superpowers/specs/2026-06-17-pricing-and-plan-limits-design.md`). Phase 1 (data model + enforcement) is merged and live locally; this phase makes the entitlements purchasable.

## Goal

Let orgs actually pay for plans, replacing the Phase-1 manual SQL grants:
- **Pay-per-production unlock** — $49.99 one-time → an unbound `production_purchases` row.
- **Extra maker seat** — $10 one-time, bound to a production → a `seat_purchases` row.
- **Unlimited** — $99/year subscription → an active `org_subscriptions` row.

Stripe writes the **same Phase-1 rows** the enforcement already reads, so no enforcement logic changes.

## Decisions (from brainstorming)

1. **Verify on return + webhook** — a single idempotent `fulfillCheckoutSession()` runs from both the webhook and the success-return page, deduped by the unique `stripe_session_id`. A returning buyer is never stuck behind webhook lag, and neither path double-grants.
2. **Stripe Customer Portal** — a `/api/billing/portal` route gives subscribers self-serve cancel/update/invoices.
3. **Inline prompts + a "Plan & billing" tab** — wire the existing gate prompts to real checkout, and add a billing tab in the org area.
4. **Any org member can purchase and manage billing** — all billing routes use `getAuthContext` (no `requireOrgAdmin`). No admin/member branching in the UI.
5. **Provider config via env**, Stripe **test mode** locally / live in Vercel.

## Config / env

Add to `.env.example` and (by Chris) to `.env.local` + Vercel:
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_UNLOCK=      # $49.99 one-time price id
STRIPE_PRICE_SEAT=        # $10 one-time price id
STRIPE_PRICE_UNLIMITED=   # $99/year recurring price id
```
Add the `stripe` npm dependency.

## Architecture

### 1. `src/lib/stripe.ts`
- `isBillingConfigured(): boolean` — true iff `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three price ids are all set.
- `getStripe(): Stripe` — lazily constructs and memoizes the SDK client (pinned `apiVersion`). Throws if `STRIPE_SECRET_KEY` is unset (callers gate on `isBillingConfigured` first).
- `PRICE_IDS = { unlock, seat, unlimited }` from env; `CHECKOUT_TYPES = ['unlock','seat','unlimited']`.

### 2. `src/lib/data/stripe-billing.ts` (the fulfillment layer; pure, testable, mock `getStripe`/`supabaseAdmin`)
- `getOrCreateStripeCustomer(orgId): Promise<string>` — return the org's `stripe_customer_id` if set; else create a Stripe customer (`metadata.orgId`), then **upsert only the customer id** onto `org_subscriptions` (insert a minimal `{org_id, stripe_customer_id, status:'inactive'}` row if none, else set `stripe_customer_id`). **Never overwrites `comped` or an existing `status`** (so Nada's comped row is safe).
- `fulfillCheckoutSession(session): Promise<void>` — idempotent grant keyed off `session.metadata.{orgId,type,productionId}`:
  - `unlock` → insert `production_purchases {org_id, stripe_session_id: session.id, source:'stripe'}` (production_id null), `on conflict (stripe_session_id) do nothing`.
  - `seat` → insert `seat_purchases {org_id, production_id, stripe_session_id, source:'stripe'}`, on-conflict-do-nothing.
  - `unlimited` → retrieve the subscription (`session.subscription`) for `status` + `current_period_end`, then **upsert `org_subscriptions` by `org_id`** with `{stripe_customer_id, stripe_subscription_id, status, current_period_end}` (preserve `comped`).
- `applySubscriptionEvent(subscription): Promise<void>` — update `org_subscriptions` matched by `stripe_subscription_id` (fallback `subscription.metadata.orgId`): set `status` + `current_period_end`; `deleted` ⇒ `status:'canceled'`. Used by subscription/invoice webhooks for renewals & cancellations.

### 3. Routes
- **`POST /api/billing/checkout`** (`getAuthContext`): body `{type, productionId?}`. 503 if `!isBillingConfigured`. Validate `type ∈ CHECKOUT_TYPES`; `seat` requires `productionId` (and `assertProductionInOrg`). `customer = getOrCreateStripeCustomer(orgId)`. Create a Checkout session:
  - mode `payment` for `unlock`/`seat`, `subscription` for `unlimited`; one line item at the matching price, qty 1.
  - `metadata: {orgId, type, productionId?}`; for `unlimited` also `subscription_data.metadata.orgId` (so subscription events resolve the org).
  - `success_url = ${APP_URL}/billing/return?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = ${APP_URL}/productions`. `APP_URL` from an env/origin helper, defaulting to the request origin (canonical `https://www.measuremycostume.com` in prod).
  - Return `{url: session.url}`.
- **`POST /api/billing/portal`** (`getAuthContext`): 503 if unconfigured. `stripe_customer_id` from `org_subscriptions`; 400 if none. Create a Billing Portal session (`return_url = ${APP_URL}/productions`). Return `{url}`.
- **`POST /api/billing/webhook`** (no auth; signature-verified): read the **raw body** via `req.text()`, verify with `getStripe().webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`; bad signature ⇒ 400. Dispatch:
  - `checkout.session.completed` ⇒ `fulfillCheckoutSession(session)`.
  - `customer.subscription.updated` / `customer.subscription.deleted` ⇒ `applySubscriptionEvent`.
  - `invoice.paid` ⇒ retrieve/forward the subscription to `applySubscriptionEvent` (renewal extends `current_period_end`).
  - Unhandled types ⇒ 200 no-op. Always 200 on success.
- **`GET /api/billing/status`** (`getAuthContext`): returns `{isUnlimited, isPaidOrg, subscriptionStatus, hasStripeCustomer, billingConfigured}` for the billing panel.

### 4. Return page — `/billing/return` (server component)
`searchParams.session_id` → `getAuthContext` → retrieve the session → **verify `session.metadata.orgId === orgId`** (can't fulfill someone else's session) → if paid/complete call `fulfillCheckoutSession` (idempotent) → redirect to `/productions`. Brief "Payment confirmed — taking you back…" copy before the redirect.

### 5. UI
- **`CheckoutButton.tsx`** (client) — props `{type, productionId?, label, className?}`. POSTs `/api/billing/checkout`; on `{url}` ⇒ `window.location = url`; on 503 ⇒ inline "Checkout isn't set up yet."; other errors ⇒ inline message. So the buttons **degrade gracefully before env is set**.
- **New-production gate** (`/productions/new`, server) — when `isBillingConfigured`, replace the disabled "Subscribe — coming soon" with `CheckoutButton`s (**Buy this production $49.99** → `unlock`, **Go Unlimited $99/yr** → `unlimited`); otherwise keep the coming-soon text.
- **`PlanLimitNotice`** — gains `reason?` + `productionId?`; renders the matching `CheckoutButton`(s): `needs_seat` → seat (with productionId) + unlimited; `needs_paid_plan`/`needs_unlock` → unlock + unlimited. Callers (`SharePanel`, `MakePieceRow`, `RoleCostumePanel`) pass `reason`/`productionId`. With no reason it falls back to today's message + coming-soon text.
- **`OrgBillingPanel.tsx`** + a **"Plan & billing"** `OrganizationProfilePage` tab in `OrgSwitcher` (alongside Makers/Fabric). Reads `GET /api/billing/status`; shows current plan (Unlimited / Pay-per-production / No plan), a **Go Unlimited** `CheckoutButton` when not unlimited, and **Manage billing** (→ `/api/billing/portal`) when a Stripe customer exists.

## Idempotency, races, security

- Duplicate fulfillment (webhook + return, or Stripe retries) is a no-op: `production_purchases`/`seat_purchases` `on conflict (stripe_session_id) do nothing`; `org_subscriptions` upsert by `org_id` is naturally idempotent.
- Subscription events that arrive before `checkout.session.completed` resolve the org via `subscription.metadata.orgId`; if no row yet, `applySubscriptionEvent` upserts one.
- The return page fulfills **only** sessions whose `metadata.orgId` matches the caller's org.
- Webhook authenticity is the Stripe signature; the route never trusts unsigned input.

## Edge cases

- **Unconfigured env** ⇒ `isBillingConfigured` false ⇒ checkout/portal 503, buttons show "not set up," gates fall back to coming-soon text. Phase-1 enforcement + manual SQL grants still work.
- **Cancellation** ⇒ `subscription.deleted`/`updated(cancel)` sets status; `isUnlimited` already respects `status` + `current_period_end` (access lasts until period end, then lapses — existing Phase-1 policy).
- **Comped orgs** (Nada) are untouched: customer-id writes preserve `comped=true`.
- **Seat for a production not in the org** ⇒ blocked by `assertProductionInOrg` in the checkout route.

## Testing (Vitest; mock `getStripe` + `supabaseAdmin`)

- `stripe-billing.ts`: `fulfillCheckoutSession` per type writes the right row; **duplicate `session.id` is a no-op**; `applySubscriptionEvent` updates status/period and handles `deleted`; `getOrCreateStripeCustomer` returns existing, creates+stores new, and **preserves `comped`**.
- `checkout` route: builds correct mode/line item/metadata per type; 503 unconfigured; `seat` without productionId → 400; cross-org production → 403.
- `webhook` route: bad signature → 400; each handled event dispatches to the right fulfillment fn; unknown event → 200 no-op.
- `portal` route: 400 with no customer; builds a portal session when present.
- `/api/billing/status`: reflects unlimited / paid / none.

## Out of scope

Proration, plan downgrades mid-term, refunds, multi-currency, tax, dunning UI, usage analytics, seat *quantity* in a single checkout (one seat per checkout for now). The Customer Portal covers cancel/update/invoices without custom UI.
