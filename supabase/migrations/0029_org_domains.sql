-- Lazy map of a non-public email domain to the org(s) that use it. Populated as
-- members load the app (recordOrgDomain). Used at onboarding to detect that a
-- signer-upper's organization already exists, so they can request to join
-- instead of creating a duplicate. See
-- docs/superpowers/specs/2026-06-18-domain-onboarding-request-to-join-design.md
create table if not exists org_domains (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  domain     text not null,
  created_at timestamptz not null default now(),
  unique (org_id, domain)
);
create index if not exists org_domains_domain_idx on org_domains(domain);
