-- One-time cross-org production shares. Each row is a single-use invite token; on
-- accept, the design layer is copied into a new production in the recipient's org.
create table if not exists production_shares (
  id                      uuid primary key default gen_random_uuid(),
  source_production_id    uuid not null references productions(id) on delete cascade,
  source_org_id           text not null,
  created_by              text not null,
  token                   text not null unique,
  recipient_email         text,
  status                  text not null default 'pending' check (status in ('pending','accepted','revoked')),
  accepted_by_org_id      text,
  accepted_production_id  uuid references productions(id) on delete set null,
  created_at              timestamptz not null default now(),
  accepted_at             timestamptz
);
create index if not exists production_shares_token_idx on production_shares (token);
create index if not exists production_shares_source_idx on production_shares (source_production_id);
