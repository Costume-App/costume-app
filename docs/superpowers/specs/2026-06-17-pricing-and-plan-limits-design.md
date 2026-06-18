# Pricing & Plan Limits — Design

**Date:** 2026-06-17
**Status:** Approved (brainstorm). Spec covers the whole billing model; the first implementation plan covers **Phase 1 only** (data model + service + enforcement). Phase 2 (Stripe) is designed here and built in a follow-up plan.

## Goal

Introduce paid plans and enforce their limits in the Measure My Costume app. Two plans:

| | **Pay-per-production** | **Unlimited** |
|---|---|---|
| Price | **$49.99 one-time**, per production | **$99/year**, recurring |
| Productions | 1 per purchase | unlimited |
| Makers per production | 3 included; **+$10 one-time** each beyond | unlimited |
| Nada's own org | — | here, **comped** |

Enforcement is **hard block + upgrade/add-seat prompt** at every surface. "Users" that count against the 3-maker limit = **distinct makers assigned to a production** (`costume_pieces.maker_id` across that production's pieces) — matching the per-production wording and the app's existing maker model.

Provider = **Stripe** (shared-stack standard; `stack-ritual` already uses Stripe).

## Decisions (from brainstorming)

1. **$49.99 = one-time**, per production (not recurring).
2. **$10/extra maker = one-time**, scoped to a specific production.
3. **$99/year = recurring** subscription, unlimited productions + makers.
4. **Nada's org → unlimited, comped** (no charge, no Stripe sub required).
5. **Over-limit = hard block** (server-side 402) + inline upgrade/add-seat CTA.
6. **"User" counted = maker assigned to the production.**

## Architecture

A single billing service (`src/lib/data/billing.ts`) is the source of truth for "what is this org/production entitled to." All enforcement points call it; no route reasons about plans directly. This mirrors kinship's `hasFeature()` pattern. Stripe is an *input* to the data model (via webhooks), never read on the request path.

### 1. Data model — migration `0028_billing.sql`

```sql
-- The unlimited ($99/yr) subscription state, one row per org.
-- Unlimited == comped OR (status in active/trialing AND current_period_end > now()).
create table org_subscriptions (
  org_id                 text primary key references organizations(clerk_org_id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 text not null default 'inactive', -- active|trialing|past_due|canceled|inactive
  current_period_end     timestamptz,
  comped                 boolean not null default false,   -- Nada's org; bypasses Stripe entirely
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One row per $49.99 production unlock. Created unbound (production_id null),
-- bound to a production when one is created/accepted. on delete set null =>
-- deleting a production returns the credit (org keeps "1 production at a time").
create table production_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid references productions(id) on delete set null,
  stripe_session_id text unique,                       -- webhook idempotency
  source            text not null default 'stripe',    -- stripe|manual|comp
  created_at        timestamptz not null default now()
);
create index production_purchases_org_idx  on production_purchases(org_id);
create index production_purchases_prod_idx on production_purchases(production_id);

-- One row per $10 extra-seat purchase, bound to a specific production.
create table seat_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid not null references productions(id) on delete cascade,
  stripe_session_id text unique,
  source            text not null default 'stripe',
  created_at        timestamptz not null default now()
);
create index seat_purchases_prod_idx on seat_purchases(production_id);
```

- `stripe_session_id` UNIQUE = idempotent webhook fulfillment (a re-delivered event inserts nothing new).
- `source` lets Phase 1 grant unlocks/comps with no Stripe (`manual` / `comp`).
- Cascade on `org_id` keeps billing rows tied to the Clerk org lifecycle (matches `makers`, `production_shares`).

### 2. Billing service — `src/lib/data/billing.ts`

Pure data functions over `supabaseAdmin`, each independently unit-testable:

- `isUnlimited(orgId): Promise<boolean>` — comped, or active/trialing with `current_period_end > now()`.
- `isPaidOrg(orgId): Promise<boolean>` — `isUnlimited` OR has ≥1 `production_purchases` row. Used by the share gate.
- `canCreateProduction(orgId): Promise<{ allowed: boolean; reason?: 'needs_unlock' }>` — unlimited ⇒ allowed; else allowed iff an **unbound** unlock exists.
- `consumeProductionUnlock(orgId, productionId): Promise<boolean>` — atomically bind one unbound unlock to `productionId`. Returns `false` if none was available (handles races). Implemented as an `UPDATE … WHERE id = (SELECT id … WHERE org_id=? AND production_id IS NULL LIMIT 1) RETURNING id` so two concurrent creates can't claim the same credit.
- `productionSeatCap(productionId): Promise<number>` — `3 + count(seat_purchases for production)`; `Infinity` if the owning org is unlimited.
- `productionMakerCount(productionId): Promise<number>` — distinct `maker_id` (non-null) across the production's costume pieces (join pieces → designs → production).
- `canAssignMakerToProduction(orgId, productionId, makerId): Promise<{ allowed: boolean; reason?: 'needs_seat' }>` — unlimited ⇒ allowed; allowed if `makerId` is already among the production's makers (reassignment is free); else allowed iff `count < cap`.

### 3. Enforcement points

All blocks return **HTTP 402** with body `{ error: string, reason: 'needs_unlock' | 'needs_seat' | 'needs_paid_plan', plans: PlanSummary }` so the client can render the right upgrade/add-seat CTA. `PlanSummary` is a small static descriptor of the two plans (labels + prices) the UI uses for prompts.

1. **Create production — `POST /api/productions`.**
   - Call `canCreateProduction(orgId)`. If `!allowed` ⇒ 402 `needs_unlock`.
   - If unlimited ⇒ create normally.
   - If non-unlimited ⇒ create the production, then `consumeProductionUnlock(orgId, production.id)`. If consume returns `false` (a concurrent create grabbed the credit), **compensating-delete** the just-created production and return 402. (Same non-atomic-but-safe pattern documented for `acceptProductionShare`.)

2. **Assign a maker to a piece — `PUT /api/productions/[id]/pieces`.**
   - Only when the request sets `makerId` to a non-null maker. Resolve the production id from the route, call `canAssignMakerToProduction`. If `!allowed` ⇒ 402 `needs_seat`. (The `[pieceId]` PATCH route only toggles `made` — no gate needed.)

3. **Share a production — `POST /api/productions/[id]/shares`.**
   - Call `isPaidOrg(orgId)`. If false ⇒ 402 `needs_paid_plan`. (This is the "only paying orgs may share" hook already noted in the sharing feature.)

4. **Accept a shared copy — `POST /api/shares/[token]/accept`.**
   - Accepting *creates* a production in the recipient's org. Before `acceptProductionShare`, gate the **recipient** org on `canCreateProduction`; if `!allowed` ⇒ 402 `needs_unlock`. After the copy lands, `consumeProductionUnlock(recipientOrgId, newProductionId)` (skip for unlimited).

### 4. Stripe integration (Phase 2 — designed, built later)

- **Three Stripe Prices:** production unlock (one-time $49.99), extra seat (one-time $10), unlimited (recurring yearly $99). Price IDs via env.
- **`POST /api/billing/checkout`** (`getAuthContext`, body `{ type: 'unlock' | 'seat' | 'unlimited', productionId? }`) → create a Stripe Checkout session (mode `payment` for unlock/seat, `subscription` for unlimited) with `metadata: { orgId, type, productionId? }` and success/cancel URLs; return `{ url }`.
- **`POST /api/billing/webhook`** (raw body, signature-verified):
  - `checkout.session.completed`: `unlock` ⇒ insert unbound `production_purchases` (stripe_session_id = session.id); `seat` ⇒ insert `seat_purchases` (production from metadata); `unlimited` ⇒ upsert `org_subscriptions` (customer/sub ids, status, period end).
  - `customer.subscription.updated` / `deleted`, `invoice.paid` ⇒ update `org_subscriptions.status` / `current_period_end` by `stripe_subscription_id`.
  - Idempotent via the unique `stripe_session_id` / `stripe_subscription_id` constraints.
- **Graceful degradation:** if `STRIPE_*` env is unset, `isEmailConfigured`-style `isBillingConfigured()` is false ⇒ `/api/billing/checkout` returns 503 and the billing UI shows "billing isn't set up yet." **Phase-1 enforcement still works** (comps/manual unlocks gate everything).
- **Env (documented in `.env.example`):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_UNLOCK`, `STRIPE_PRICE_SEAT`, `STRIPE_PRICE_UNLIMITED`.

### 5. Policy / edge cases

- **Unlimited lapses** (past_due/canceled/expired): `isUnlimited` ⇒ false. Org can't create *new* productions or add seats, but **existing data stays editable** — no retroactive lock; productions created while unlimited have no bound unlock and remain usable.
- **Reassigning an existing maker** on a production never consumes a seat.
- **Removing a maker** frees room under the cap (count is derived). A purchased seat permanently raises that production's cap.
- **Deleting a production** returns its unlock (`on delete set null`) — the org can create another.
- **Comping Nada:** a documented manual insert `org_subscriptions(org_id=<her prod orgId>, comped=true, status='active')`. Her orgId isn't known at migration authoring time, so this is an operational step, not seeded SQL.

### 6. Testing (TDD; repo Vitest + `supabaseAdmin` mock patterns)

**Phase 1:**
- `billing.test.ts`: `isUnlimited` (comped / active / expired / past_due / none), `isPaidOrg`, `canCreateProduction` (unlimited / unbound-available / none), seat-cap math (+0/+N/unlimited), `canAssignMakerToProduction` (unlimited / existing maker / under cap / at cap).
- Route tests: create-production 402 `needs_unlock` then 201 + consume; unlimited bypass; create-then-consume race → compensating delete. Pieces PUT 402 `needs_seat` at cap; allowed for existing maker / under cap. Shares POST 402 `needs_paid_plan` for unpaid; allowed for paid. Accept 402 when recipient can't create; consumes recipient unlock on success.

**Phase 2 (deferred to its plan):** webhook fulfillment + idempotency, checkout-session creation, `isBillingConfigured` 503 path.

## Out of scope (this project)

Proration, upgrade/downgrade flows mid-term, refunds, multi-currency, tax handling, usage analytics, a self-serve billing portal (Stripe Customer Portal can be a later add). Phase 1 ships no Stripe code at all.
