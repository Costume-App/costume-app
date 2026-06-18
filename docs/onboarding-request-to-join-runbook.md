# Domain-Aware Onboarding — Runbook

## Apply the migration
Apply `supabase/migrations/0029_org_domains.sql` to the shared Supabase project.

## Email
The "request access" notification uses Resend (`sendEmail`). It needs `RESEND_API_KEY`
set in `.env.local` + Vercel (and a verified sending domain). Until then, "Request access"
returns `{sent:false}` and the UI tells the user to ask an admin for an invite.

## How it works
- As members load the app, `AppNav` records their org's non-public email domain in `org_domains`
  (gmail/yahoo/etc. are skipped). Existing orgs backfill automatically as members visit.
- A new signer-upper with no org hits `/onboarding`; if exactly one org matches their
  verified email domain, they see "Request access" (emails that org's admins) plus a
  de-emphasized "create a different organization" fallback. No match → normal create.
- The admin invites the requester via the org's Members management (Clerk). Membership is free;
  production/maker limits still gate usage.

## Smoke test
1. As an existing org member, load the app → confirm a row appears in `org_domains` for your domain.
2. Sign up a NEW user with the same (non-public) email domain, no org → `/onboarding` shows
   "…already has an organization for <domain>" + Request access.
3. Click Request access → org admins get the email (once Resend is configured) → admin invites.
4. Sign up with a gmail.com address → no match → normal create flow.
