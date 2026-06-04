-- Standard body-measurement field definitions (data-driven; Nada refines later).
create table if not exists measurement_definitions (
  key           text primary key,
  label         text not null,
  unit          text not null,            -- e.g. 'in', 'lb'
  input_type    text not null default 'number',
  help_text     text,
  display_order int  not null
);

-- Cast members for a production. No photos; just a label + measurements.
create table if not exists performers (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  label         text not null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists performers_production_id_idx on performers(production_id);

-- One row per (performer, measurement). value stored in the definition's unit.
create table if not exists performer_measurements (
  id              uuid primary key default gen_random_uuid(),
  performer_id    uuid not null references performers(id) on delete cascade,
  measurement_key text not null references measurement_definitions(key),
  value_numeric   numeric not null,
  unit            text not null,
  updated_at      timestamptz not null default now(),
  unique (performer_id, measurement_key)
);

-- Seed the standard set (TO BE CONFIRMED by Nada against her 4-page intake form).
insert into measurement_definitions (key, label, unit, help_text, display_order) values
  ('height',        'Height',         'in', 'Total height, no shoes',                 10),
  ('weight',        'Weight',         'lb', 'Approximate body weight',                20),
  ('chest',         'Chest / bust',   'in', 'Around the fullest part',                30),
  ('waist',         'Waist',          'in', 'Around the natural waistline',           40),
  ('hips',          'Hips',           'in', 'Around the fullest part of the hips',    50),
  ('shoulder',      'Shoulder width', 'in', 'Seam to seam across the back',           60),
  ('sleeve',        'Sleeve length',  'in', 'Shoulder to wrist, arm slightly bent',   70),
  ('back_length',   'Back length',    'in', 'Nape of neck to natural waist',          80),
  ('inseam',        'Inseam',         'in', 'Crotch to ankle',                        90),
  ('outseam',       'Outseam',        'in', 'Waist to ankle',                        100)
on conflict (key) do nothing;
