-- Organizations mirror Clerk orgs (id = Clerk org id). Billing-ready placeholders.
create table if not exists organizations (
  clerk_org_id text primary key,
  name         text not null,
  plan         text not null default 'free',
  plan_status  text not null default 'active',
  limits       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists productions (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  created_by        text not null,                 -- Clerk user id
  title             text not null,
  show_date         date,
  play_template_id  uuid,                          -- FK added in a later milestone
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists productions_org_id_idx on productions(org_id);
