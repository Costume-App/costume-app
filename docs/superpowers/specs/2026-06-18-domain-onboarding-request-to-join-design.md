# Domain-Aware Onboarding + Request-to-Join — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorm).

## Goal

Stop same-domain users from accidentally creating a **duplicate organization** at signup, and let them **request to join** the existing org (which notifies the org's admins by email). This is the free, invitation-based version of org joining — we are NOT buying Clerk's Verified Domains add-on (revisit later), and we are NOT changing the billing/seat model (org membership stays free; the existing per-production maker limits gate usage).

Today: a no-org user hits `/onboarding` → Clerk `<OrganizationList>` (create OR accept-invite). With no domain awareness, a user whose org already exists gets nudged into creating a second org. Fix: detect the existing org by the user's verified email domain and offer "request access" instead, with a de-emphasized create fallback.

## Decisions (from brainstorming)

- **Invitation-based ("#3"), not the paid add-on.** Admin still invites via Clerk's existing member management; we add discovery + an admin notification.
- **Lazy domain→org mapping** (no creation hook; backfills as members visit).
- **Keep a de-emphasized "create a different organization" fallback** (handles legit shared-domain cases).
- **No billing change** — membership is free; usage is gated by the shipped per-production maker seats.
- **Resend is configured** (account set up) — the admin notification sends for real, but stays best-effort/`isEmailConfigured`-gated.

## Architecture

### 1. Migration `0029_org_domains.sql`
```sql
-- Lazy map of a non-public email domain to the org(s) that use it. Populated as
-- members load the app (see recordOrgDomain). Used at onboarding to detect that
-- a signer-upper's org already exists.
create table if not exists org_domains (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  domain     text not null,
  created_at timestamptz not null default now(),
  unique (org_id, domain)
);
create index if not exists org_domains_domain_idx on org_domains(domain);
```

### 2. `src/lib/email-domains.ts` (pure, unit-tested)
- `emailDomain(email: string): string | null` — lowercased domain after `@`, or null if malformed.
- `isPublicEmailDomain(domain: string): boolean` — membership test against a constant `PUBLIC_EMAIL_DOMAINS` set (`gmail.com`, `googlemail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, `live.com`, `icloud.com`, `me.com`, `aol.com`, `proton.me`, `protonmail.com`, `gmx.com`, `mail.com`).

### 3. `src/lib/data/org-domains.ts`
- `recordOrgDomain(orgId: string, email: string): Promise<void>` — `emailDomain(email)`; if null or `isPublicEmailDomain` → no-op; else `supabaseAdmin.from("org_domains").upsert({org_id, domain}, { onConflict: "org_id,domain", ignoreDuplicates: true })`. Errors are swallowed by the caller (best-effort capture).
- `findOrgsByDomain(domain: string): Promise<{ orgId: string; name: string }[]>` — select `org_domains` rows for the domain, joined to `organizations` for the name (two queries: domain rows → org names by `clerk_org_id`). Returns [] for a public/empty domain.

### 4. Lazy capture in `AppNav` (`src/components/AppNav.tsx`, server component)
`AppNav` already calls `currentUser()`. After resolving the user, if there's an active org (`auth()` → `orgId`) and a primary email, call `recordOrgDomain(orgId, email)` wrapped in try/catch (never break the nav). Idempotent upsert; one cheap query per app page load is acceptable at current scale (note: replace with a creation hook or the Clerk add-on if org count grows).

### 5. Onboarding (`/onboarding`) → server component
- `currentUser()` → primary email → `emailDomain`.
- `matches = domain ? await findOrgsByDomain(domain) : []`.
- **Exactly one match** → render `<RequestToJoin orgId={match.orgId} orgName={match.name} />` (client) + a de-emphasized `<details>`-style "Create a different organization instead" disclosure that reveals the existing `<OrganizationList>` (kept in a small client wrapper).
- **Zero or multiple matches** (or public/no domain) → render the create flow (`<OrganizationList>`) as today, under the existing heading.

`RequestToJoin` (client) shows "Measure My Costume already has an organization for `<domain>` — *<orgName>*. Ask an admin to invite you." + a **Request access** button that POSTs `/api/org/request-access`; on `{sent:true}` shows "We've let your admins know"; on `{sent:false}` shows "We couldn't email your admins automatically — ask them to invite you."; on error, an inline message.

### 6. `POST /api/org/request-access`
- Auth: `const { userId } = await auth()` — require `userId` only (the requester has **no** active org yet; `getAuthContext` would 403). 401 if no `userId`.
- Body: `{ orgId: string }`.
- **Security re-check:** load the requester's verified primary email (`clerk-user`/`currentUser`), compute its domain, and confirm `findOrgsByDomain(domain)` includes the posted `orgId`. If not → 403 (can't request into an arbitrary org; can't bypass the public-domain guard).
- Look up the org's admins: `getOrganizationMembershipList({ organizationId: orgId })`, filter `role === "org:admin"`, collect their emails (membership `publicUserData.identifier`, falling back to a `clerkClient.users.getUser` email lookup if needed).
- For each admin email, `sendEmail({ to, ...requestAccessEmail(requesterName, requesterEmail, orgName) })`, best-effort. Return `{ sent: <true if isEmailConfigured() and at least one send succeeded> }`.
- `src/lib/request-access-email.ts` `requestAccessEmail(requesterName, requesterEmail, orgName): { subject, text }` — mirrors `share-invite-email.ts`.

## Data flow

1. Member loads any app page → `AppNav` records their `(orgId, domain)` (lazy backfill).
2. New user signs up, no org → `/onboarding` looks up their domain → finds the org → shows Request access.
3. Request access → server verifies domain↔org, emails the org admins.
4. Admin invites the requester via Clerk member management (existing) → requester accepts → in the org.

## Edge cases

- **Public email domain** (gmail, etc.): never recorded, never matched → normal create. (Prevents clustering everyone into one org.)
- **No org has the domain yet** (brand-new domain): no match → create flow (this user starts the org; their domain gets recorded once they're in).
- **Multiple orgs on one domain** (district): ambiguous → fall back to create flow (don't guess which to join).
- **Resend not configured / send fails:** `{ sent: false }`; UI tells the user to ask for an invite. Request isn't persisted server-side (email-only) — acceptable for v1; the admin acts on the email.
- **Tampered `orgId` in the POST:** rejected by the domain↔org re-check (403).

## Testing (Vitest; mock `supabaseAdmin`, `@clerk/nextjs/server`, `@/lib/email`)

- `email-domains`: `emailDomain` parsing (valid/malformed/uppercase); `isPublicEmailDomain` true for gmail, false for a school domain.
- `org-domains`: `recordOrgDomain` skips public/malformed (no upsert), upserts a real domain with `ignoreDuplicates`; `findOrgsByDomain` returns name-joined rows, [] for unknown/public.
- `POST /api/org/request-access`: 401 no user; 403 when the requester's domain doesn't map to the posted org; on a valid match, emails only `org:admin` members and returns `{sent:true}`; `{sent:false}` when `isEmailConfigured()` is false (no send attempted).
- AppNav capture + onboarding page are best-effort/presentational (no RSC-page tests, per repo norm) — verified via build + manual click-through.

## Out of scope

Clerk Verified Domains / true domain-ownership verification (revisit — paid add-on); persisting join requests in a DB table or an in-app admin approval queue (email notification only for v1); any change to the billing/seat model; auto-adding the requester to the org without an admin invite.
