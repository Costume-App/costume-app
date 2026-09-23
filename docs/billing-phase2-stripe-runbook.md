# Billing Phase 2: Stripe Setup Runbook

## Env (test mode locally, live in Vercel)
Set in `.env.local` and Vercel (all five required; `isBillingConfigured()` gates on them):
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_UNLOCK ($49.99 one-time), STRIPE_PRICE_SEAT ($10 one-time), STRIPE_PRICE_UNLIMITED ($99.99/yr recurring)

## Webhook
- Endpoint: `https://www.measuremycostume.com/api/billing/webhook` (public; verified by signature).
- Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.
- The signing secret from that endpoint is `STRIPE_WEBHOOK_SECRET`.
- Local testing: `stripe listen --forward-to localhost:6100/api/billing/webhook` (use the printed `whsec_…` as the local `STRIPE_WEBHOOK_SECRET`), then `stripe trigger checkout.session.completed`.

## Smoke test (test mode)
1. Fresh org with no plan → `/productions` → New Production → see the gate with real buy buttons.
2. "Buy this production ($49.99)" → Stripe test card `4242 4242 4242 4242` → returns to `/billing/return` → redirects to `/productions` → New Production now shows the form.
3. "Go Unlimited" → completes → org is unlimited (no further gates).
4. Org area → Plan & billing → "Manage billing" opens the Stripe portal; cancel → subscription webhooks flip status.

## Notes
- Until env is set, checkout/portal 503 and buttons show "Checkout isn't set up yet."; Phase-1 manual SQL grants still work.
- Fulfillment is idempotent (webhook + return page dedupe on `stripe_session_id`); comped orgs are never overwritten.
