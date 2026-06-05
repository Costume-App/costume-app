-- Per-role costume pieces (the "design") and per-performer sourcing.

-- One garment in a character's costume, defined once per role.
create table if not exists costume_designs (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  name          text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists costume_designs_production_id_idx on costume_designs(production_id);
create index if not exists costume_designs_role_id_idx on costume_designs(role_id);

-- One performer's instance of a design, holding how they obtain it.
create table if not exists costume_pieces (
  id                   uuid primary key default gen_random_uuid(),
  costume_design_id    uuid not null references costume_designs(id) on delete cascade,
  casting_id           uuid not null references castings(id) on delete cascade,
  source               text not null default 'make' check (source in ('make','on_hand','shared')),
  shared_with_piece_id uuid references costume_pieces(id) on delete set null,
  source_note          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (costume_design_id, casting_id)
);
create index if not exists costume_pieces_design_id_idx on costume_pieces(costume_design_id);
create index if not exists costume_pieces_casting_id_idx on costume_pieces(casting_id);
