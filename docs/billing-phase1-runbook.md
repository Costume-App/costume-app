# Billing Phase 1 — Operational Runbook

Phase 1 enforces plan limits but has **no Stripe**. Entitlements are granted by SQL
in the Supabase SQL editor until Phase 2 wires Checkout/webhooks.

## Apply the migration
Apply `supabase/migrations/0028_billing.sql` to the shared Supabase project.

## Comp Nada's org (unlimited, free)
Find her Clerk org id (Clerk dashboard → Organizations), then:

    insert into org_subscriptions (org_id, status, comped)
    values ('<NADA_ORG_ID>', 'active', true)
    on conflict (org_id) do update set comped = true, status = 'active';

## Grant a production unlock for testing (simulates a $49.99 purchase)
    insert into production_purchases (org_id, source) values ('<ORG_ID>', 'manual');
-- Creating (or accepting) a production then binds this row to that production.

## Grant an extra maker seat on a production (simulates a $10 purchase)
    insert into seat_purchases (org_id, production_id, source)
    values ('<ORG_ID>', '<PRODUCTION_ID>', 'manual');

## Behaviour to expect
- No unlock + not comped/active  -> create production / accept share returns 402 needs_unlock.
- 4th distinct maker on a production at cap -> piece save returns 402 needs_seat.
- Unpaid org -> sharing returns 402 needs_paid_plan.
- Comped/unlimited org -> everything allowed, nothing consumed.
