-- Per-piece skirt construction, so fabric yardage can be computed from the
-- performer's measurements (src/lib/fabric/skirt-yardage.ts) instead of estimated
-- by the AI. A null construction means "not a skirt" and leaves the piece on the
-- AI path exactly as before, so every existing row keeps its current behaviour.
alter table costume_pieces add column if not exists skirt_construction text
  constraint costume_pieces_skirt_construction_check
  check (skirt_construction in
    ('full_circle','three_quarter_circle','half_circle','gathered'));

-- Gathered skirts only: how many times the waist measurement the panels total.
-- Meaningless for the circle constructions, which get their fullness from geometry.
alter table costume_pieces add column if not exists skirt_fullness numeric
  constraint costume_pieces_skirt_fullness_check
  check (skirt_fullness is null or skirt_fullness > 0);

-- Per-piece skirt length override, in inches. When absent, the calculator falls
-- back to the performer's outseam ("waist to ankle") measurement, so a skirt
-- defaults to floor-length unless the piece itself says otherwise (e.g. a
-- knee-length skirt for a role whose other pieces are floor-length).
alter table costume_pieces add column if not exists skirt_length_in numeric
  constraint costume_pieces_skirt_length_in_check
  check (skirt_length_in is null or skirt_length_in > 0);
