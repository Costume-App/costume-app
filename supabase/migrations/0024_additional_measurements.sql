-- Additional body-measurement fields requested by Nada, plus the schema change that
-- lets non-numeric sizes (shirt/pant/shoe) be stored as text alongside numeric ones.
-- Data-driven, same as the 0002 seed: the form renders these automatically (numeric vs
-- text by input_type) and the AI fabric estimator picks them up by label.

-- 1) Allow text-valued measurements: value_numeric becomes optional, value_text is added,
--    and a row must carry at least one of the two.
alter table performer_measurements alter column value_numeric drop not null;
alter table performer_measurements add column if not exists value_text text;
alter table performer_measurements
  add constraint performer_measurements_value_present
  check (value_numeric is not null or value_text is not null);

-- 2) Numeric fields (input_type defaults to 'number'). display_order continues from 100.
insert into measurement_definitions (key, label, unit, help_text, display_order) values
  ('neck',              'Neck',              'in', 'Around the base of the neck, for collars',           110),
  ('arm_circumference', 'Arm circumference', 'in', 'Around the fullest part of the upper arm',           120),
  ('wrist',             'Wrist',             'in', 'Around the wrist bone, for cuffs',                    130),
  ('thigh',             'Thigh',             'in', 'Around the fullest part of the thigh',                140),
  ('knee',              'Knee',              'in', 'Around the knee, for breeches',                       150),
  ('head',              'Head circumference','in', 'Around the forehead, for hats and headpieces',       160),
  ('nape_to_floor',     'Nape to floor',     'in', 'Center back of the neck straight down to the floor', 170)
on conflict (key) do nothing;

-- 3) Text fields (free text — input_type 'text', no unit). help_text doubles as the
--    input placeholder so the expected format is visible.
insert into measurement_definitions (key, label, unit, input_type, help_text, display_order) values
  ('shirt_size', 'Shirt size', '', 'text', 'e.g. XS, S, M, L, XL, XXL, XXXL', 180),
  ('pant_size',  'Pant size',  '', 'text', 'Waist/Inseam, e.g. 36/30',        190),
  ('shoe_size',  'Shoe size',  '', 'text', 'e.g. Men''s 10 or Women''s 8.5',  200)
on conflict (key) do nothing;
