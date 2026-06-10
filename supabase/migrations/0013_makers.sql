-- Org-level roster of people who make costumes (sewists). Assigned to costume
-- pieces in a later migration. Color reuses the cast color tokens.
create table if not exists makers (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  name       text not null,
  color      text not null default 'slate',
  created_at timestamptz not null default now()
);
create index if not exists makers_org_id_idx on makers(org_id);
