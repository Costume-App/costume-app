-- Characters in a production (e.g. "Mary Poppins", "Bert").
create table if not exists roles (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name          text not null,
  display_order int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists roles_production_id_idx on roles(production_id);

-- Assignment of a person (performer) to a role, as primary or understudy.
-- cast_id (Gold/Blue) is intentionally deferred to the next slice.
create table if not exists castings (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  performer_id  uuid not null references performers(id) on delete cascade,
  assignment    text not null check (assignment in ('primary', 'understudy')),
  created_at    timestamptz not null default now(),
  unique (role_id, performer_id)
);
create index if not exists castings_production_id_idx on castings(production_id);
create index if not exists castings_role_id_idx on castings(role_id);
