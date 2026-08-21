> [!IMPORTANT]
> **Pending check: local dev port moved to 6100 on 2026-08-21.**
> This project used to run on the shared default 3000. Externally registered callbacks may still
> point at `localhost:3000` and will fail on the first local auth or payment flow.
>
> Verify these consoles once, then delete this block:
>
> - [ ] **Clerk**: Dashboard for this app, Configure, Domains/Paths. Check the development instance host and any allowed origins or redirect URLs still pointing at `localhost:3000`.
> - [ ] **Stripe**: local webhooks come from `stripe listen --forward-to`, so update the port in whatever command or script you use. Also check any `return_url` or `success_url` built from a hardcoded localhost.
> - [ ] **Supabase**: Dashboard, Authentication, URL Configuration. Check `Site URL` and the `Redirect URLs` allowlist. Only matters if this project uses Supabase Auth rather than just the DB client.
>
> Also grep this repo for `localhost:3000` and for a stale `NEXT_PUBLIC_APP_URL` in `.env.local`.
> Registry and full rules: `~/projects/PORTS.md`.

@AGENTS.md
