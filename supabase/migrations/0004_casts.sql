-- Named, colored casts within a production (e.g. Gold / Blue).
create table if not exists casts (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name          text not null,
  color         text not null default 'slate',
  is_default    boolean not null default false,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists casts_production_id_idx on casts(production_id);

-- One default cast per production that doesn't have any cast yet (idempotent).
insert into casts (production_id, name, color, is_default, display_order)
select p.id, 'Main Cast', 'slate', true, 0
from productions p
where not exists (select 1 from casts c where c.production_id = p.id);

-- Add cast_id to castings, backfill to each production's default cast, then enforce.
alter table castings add column if not exists cast_id uuid references casts(id) on delete cascade;

update castings cs
set cast_id = c.id
from casts c
where c.production_id = cs.production_id and c.is_default = true and cs.cast_id is null;

alter table castings alter column cast_id set not null;

-- Uniqueness now keys on the cast as well.
alter table castings drop constraint if exists castings_role_id_performer_id_key;
alter table castings add constraint castings_cast_role_performer_key
  unique (cast_id, role_id, performer_id);

-- At most one primary per (cast, role).
create unique index if not exists castings_one_primary_per_cast_role
  on castings (cast_id, role_id) where assignment = 'primary';

create index if not exists castings_cast_id_idx on castings(cast_id);
