-- Pricing & plan limits (Phase 1). See docs/superpowers/specs/2026-06-17-pricing-and-plan-limits-design.md
-- org_subscriptions: the $99/yr unlimited plan, one row per org.
-- Unlimited == comped OR (status in active/trialing AND (current_period_end IS NULL OR > now())).
create table if not exists org_subscriptions (
  org_id                 text primary key references organizations(clerk_org_id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 text not null default 'inactive',
  current_period_end     timestamptz,
  comped                 boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- production_purchases: one row per $49.99 unlock. Unbound (production_id null)
-- until consumed by creating/accepting a production. on delete set null returns
-- the credit if the production is deleted.
create table if not exists production_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid references productions(id) on delete set null,
  stripe_session_id text unique,
  source            text not null default 'stripe',
  created_at        timestamptz not null default now()
);
create index if not exists production_purchases_org_idx  on production_purchases(org_id);
create index if not exists production_purchases_prod_idx on production_purchases(production_id);

-- seat_purchases: one row per $10 extra-maker seat, bound to a production.
create table if not exists seat_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  production_id     uuid not null references productions(id) on delete cascade,
  stripe_session_id text unique,
  source            text not null default 'stripe',
  created_at        timestamptz not null default now()
);
create index if not exists seat_purchases_prod_idx on seat_purchases(production_id);
