-- Multiple show dates per production (replaces the single productions.show_date).
create table if not exists show_dates (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  show_date     date not null,
  created_at    timestamptz not null default now()
);
create index if not exists show_dates_production_id_idx on show_dates(production_id);

-- Preserve existing dates.
insert into show_dates (production_id, show_date)
select id, show_date from productions where show_date is not null;

-- One source of truth.
alter table productions drop column show_date;
