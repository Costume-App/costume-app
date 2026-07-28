-- Per-piece skirt construction, so fabric yardage can be computed from the
-- performer's measurements (src/lib/fabric/skirt-yardage.ts) instead of estimated
-- by the AI. A null construction means "not a skirt" and leaves the piece on the
-- AI path exactly as before, so every existing row keeps its current behaviour.
alter table costume_pieces add column if not exists skirt_construction text
  check (skirt_construction in
    ('full_circle','three_quarter_circle','half_circle','gathered'));

-- Gathered skirts only: how many times the waist measurement the panels total.
-- Meaningless for the circle constructions, which get their fullness from geometry.
alter table costume_pieces add column if not exists skirt_fullness numeric;
