# Resume Checkout After Signup — Runbook

## Flow
1. Logged-out visitor clicks a landing pricing card → `GET /get-started?plan=unlock|unlimited`
   → sets a one-shot `checkout_intent` cookie → `/sign-up`.
2. They sign up (or sign in) → onboarding creates an org → `/productions`.
3. Middleware sees an org + the cookie → redirects to `/billing/resume`.
4. `/billing/resume` clears the cookie and redirects straight to Stripe Checkout for that plan.
5. Pay → `/billing/return` → entitlement granted → `/productions`. Cancel → `/productions`.

## Requirements
- Needs the live `STRIPE_*` env in Vercel (same as the rest of checkout). If billing isn't
  configured, `/billing/resume` just lands the user in `/productions` (no dead-end).
- Cookie is `secure` only in production; on local http it is set non-secure so the flow is testable.

## Smoke test (test mode)
1. Logged out, open the landing, click "Unlimited" → you're on `/sign-up` (check the
   `checkout_intent` cookie is set in devtools).
2. Sign up a new account → create an org in onboarding → you should be bounced to Stripe
   Checkout for Unlimited (not just dropped on /productions).
3. Cancel at Stripe → land on `/productions`, cookie gone (no redirect loop).
4. Repeat clicking "Pay per production" → resumes the $49.99 one-time checkout.
5. Existing user: log out, click a plan, sign IN → after sign-in you're sent to Stripe.
