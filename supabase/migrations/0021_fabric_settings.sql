-- Org-level fabric settings: a managed list of fabric widths and of suppliers
-- (each with a default price/yard). org_id is the Clerk org id (text), matching makers.
create table if not exists fabric_widths (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  value text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists fabric_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  name text not null,
  price_per_yard numeric,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fabric_widths_org_idx on fabric_widths (org_id);
create index if not exists fabric_suppliers_org_idx on fabric_suppliers (org_id);
